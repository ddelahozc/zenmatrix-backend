require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key'; // Usar variable de entorno fuerte

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba inicial
app.get('/', (req, res) => {
    res.send('¡La API de ZenMatrix está funcionando! 🎉');
});

// Rutas de Autenticación (Registro y Login)
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ error: 'El email ya está registrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
            },
        });

        const { password: userPassword, ...userWithoutPassword } = newUser;
        res.status(201).json({ message: 'Usuario registrado exitosamente', user: userWithoutPassword });

    } catch (error) {
        console.error('Error en el registro de usuario:', error);
        res.status(500).json({ error: 'No se pudo registrar el usuario.', details: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

        const { password: userPassword, ...userWithoutPassword } = user;
        res.status(200).json({ message: 'Inicio de sesión exitoso', token, user: userWithoutPassword });

    } catch (error) {
        console.error('Error en el inicio de sesión:', error);
        res.status(500).json({ error: 'No se pudo iniciar sesión.', details: error.message });
    }
});

// --- Middleware para proteger rutas (Autenticación por Token) ---
const authenticateToken = (req, res, next) => {
    // Obtener el token del encabezado de autorización
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ error: 'Token no proporcionado.' }); // No hay token
    }

    // Verificar el token
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Error al verificar token:', err);
            // Si el token es inválido o expirado
            return res.status(403).json({ error: 'Token inválido o expirado.' });
        }
        // Si el token es válido, adjuntar la información del usuario (del token) a la petición
        req.user = user; // { userId: ... }
        next(); // Continuar con la siguiente función middleware o controlador de ruta
    });
};

// --- Rutas de Tareas (AHORA PROTEGIDAS) ---

// Ruta para crear una nueva tarea (PROTEGIDA)
app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        // userId ahora viene del token, no del body de la petición
        const { userId } = req.user;
        const { proyecto, responsable, titulo, descripcion, fechaVencimiento, prioridad } = req.body;

        if (!titulo || !proyecto || !responsable || !prioridad) {
            return res.status(400).json({ error: 'Faltan campos obligatorios: titulo, proyecto, responsable, prioridad.' });
        }

        const parsedFechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : undefined;

        const newTask = await prisma.task.create({
            data: {
                proyecto,
                responsable,
                titulo,
                descripcion,
                fechaVencimiento: parsedFechaVencimiento,
                prioridad,
                userId: userId, // Asignar el ID del usuario autenticado
            },
        });

        res.status(201).json(newTask);

    } catch (error) {
        console.error('Error al crear la tarea:', error);
        res.status(500).json({ error: 'No se pudo crear la tarea.', details: error.message });
    }
});

// Ruta para obtener tareas con filtros, búsqueda, ordenamiento y paginación (PROTEGIDA)
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user; // Obtener el ID del usuario autenticado
        const { search, priority, isCompleted, proyecto, sortBy, sortDirection, page, limit } = req.query;

        const whereClause = {
            userId: userId, // Solo obtener tareas que pertenecen al usuario autenticado
        };

        if (search) {
            whereClause.OR = [
                { titulo: { contains: search } },
                { descripcion: { contains: search } },
            ];
        }

        if (priority) {
            whereClause.prioridad = priority;
        }

        if (isCompleted !== undefined && isCompleted !== null && isCompleted !== '') {
            whereClause.isCompleted = isCompleted === 'true';
        }

        if (proyecto) {
            whereClause.proyecto = { contains: proyecto };
        }

        let orderByClause = {};
        if (sortBy && sortDirection) {
            orderByClause = {
                [sortBy]: sortDirection,
            };
        } else {
            orderByClause = { createdAt: 'desc' };
        }

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const skip = (pageNum - 1) * limitNum;

        const totalCount = await prisma.task.count({ where: whereClause });

        const tasks = await prisma.task.findMany({
            where: whereClause,
            orderBy: orderByClause,
            skip: skip,
            take: limitNum,
        });

        res.status(200).json({
            tasks,
            totalCount,
            currentPage: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(totalCount / limitNum),
        });

    } catch (error) {
        console.error('Error al obtener las tareas con filtros, ordenamiento y paginación:', error);
        res.status(500).json({ error: 'No se pudieron obtener las tareas.', details: error.message });
    }
});

// Ruta para actualizar una tarea por su ID (PROTEGIDA)
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.user; // Obtener el ID del usuario autenticado
        const { proyecto, responsable, titulo, descripcion, fechaVencimiento, fechaTerminada, prioridad, isCompleted } = req.body;

        const parsedFechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : undefined;
        const parsedFechaTerminada = fechaTerminada ? new Date(fechaTerminada) : null;

        const updatedTask = await prisma.task.update({
            where: {
                id: parseInt(id),
                userId: userId, // Asegurar que la tarea pertenezca al usuario autenticado
            },
            data: {
                proyecto,
                responsable,
                titulo,
                descripcion,
                fechaVencimiento: parsedFechaVencimiento,
                fechaTerminada: parsedFechaTerminada,
                prioridad,
                isCompleted,
            },
        });

        if (!updatedTask) {
            // Este caso puede ocurrir si la tarea no existe O si no pertenece al userId
            return res.status(404).json({ error: 'Tarea no encontrada o no tienes permiso para actualizarla.' });
        }

        res.status(200).json(updatedTask);

    } catch (error) {
        console.error('Error al actualizar la tarea:', error);
        res.status(500).json({ error: 'No se pudo actualizar la tarea.', details: error.message });
    }
});

// Ruta para eliminar una tarea por su ID (PROTEGIDA)
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.user; // Obtener el ID del usuario autenticado

        const deletedTask = await prisma.task.delete({
            where: {
                id: parseInt(id),
                userId: userId, // Asegurar que la tarea pertenezca al usuario autenticado
            },
        });

        if (!deletedTask) {
            // Este caso puede ocurrir si la tarea no existe O si no pertenece al userId
            return res.status(404).json({ error: 'Tarea no encontrada o no tienes permiso para eliminarla.' });
        }

        res.status(204).send(); // 204 No Content para eliminación exitosa

    } catch (error) {
        console.error('Error al eliminar la tarea:', error);
        res.status(500).json({ error: 'No se pudo eliminar la tarea.', details: error.message });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de ZenMatrix API corriendo en http://localhost:${PORT}`);
    console.log('✅ Conectado a la base de datos MySQL con Prisma.');
});

// Manejo de cierre de Prisma (opcional, pero buena práctica)
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});
