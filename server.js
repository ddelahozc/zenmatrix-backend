require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs'); // Importa bcryptjs para hashear contraseñas
const jwt = require('jsonwebtoken'); // Importa jsonwebtoken para JWTs

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
// Secreto para firmar los JSON Web Tokens. ¡En producción, esto debería ser una variable de entorno fuerte!
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key'; // Usar variable de entorno o un secreto por defecto

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba inicial
app.get('/', (req, res) => {
    res.send('¡La API de ZenMatrix está funcionando! 🎉');
});

// --- NUEVAS RUTAS DE AUTENTICACIÓN ---

// Ruta para el registro de nuevos usuarios
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
        }

        // Verificar si el usuario ya existe
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ error: 'El email ya está registrado.' });
        }

        // Hashear la contraseña antes de guardarla en la base de datos
        // El '10' es el factor de sal (salt rounds), un valor común y seguro
        const hashedPassword = await bcrypt.hash(password, 10);

        // Crear el nuevo usuario en la base de datos
        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
            },
        });

        // No devolver la contraseña hasheada en la respuesta
        const { password: userPassword, ...userWithoutPassword } = newUser;
        res.status(201).json({ message: 'Usuario registrado exitosamente', user: userWithoutPassword });

    } catch (error) {
        console.error('Error en el registro de usuario:', error);
        res.status(500).json({ error: 'No se pudo registrar el usuario.', details: error.message });
    }
});

// Ruta para el inicio de sesión de usuarios
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
        }

        // Buscar al usuario por email
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // Comparar la contraseña proporcionada con la contraseña hasheada en la base de datos
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // Generar un JSON Web Token (JWT)
        // El token contiene el ID del usuario y expira en 1 hora
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

        // No devolver la contraseña hasheada en la respuesta
        const { password: userPassword, ...userWithoutPassword } = user;
        res.status(200).json({ message: 'Inicio de sesión exitoso', token, user: userWithoutPassword });

    } catch (error) {
        console.error('Error en el inicio de sesión:', error);
        res.status(500).json({ error: 'No se pudo iniciar sesión.', details: error.message });
    }
});

// --- FIN DE NUEVAS RUTAS DE AUTENTICACIÓN ---


// Middleware para proteger rutas (se usará más adelante)
// const authenticateToken = (req, res, next) => { ... };

// Ruta para crear una nueva tarea (AÚN NO PROTEGIDA)
app.post('/api/tasks', async (req, res) => {
    try {
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
                // userId: req.user.userId, // Esto se habilitará cuando la ruta esté protegida
            },
        });

        res.status(201).json(newTask);

    } catch (error) {
        console.error('Error al crear la tarea:', error);
        res.status(500).json({ error: 'No se pudo crear la tarea.', details: error.message });
    }
});

// Ruta para obtener tareas con filtros, búsqueda, ordenamiento y paginación (AÚN NO PROTEGIDA)
app.get('/api/tasks', async (req, res) => {
    try {
        const { search, priority, isCompleted, proyecto, sortBy, sortDirection, page, limit } = req.query;

        const whereClause = {};
        // if (req.user && req.user.userId) { // Esto se habilitará cuando la ruta esté protegida
        //     whereClause.userId = req.user.userId;
        // }

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

// Rutas PUT y DELETE de tareas (AÚN NO PROTEGIDAS)
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { proyecto, responsable, titulo, descripcion, fechaVencimiento, fechaTerminada, prioridad, isCompleted } = req.body;

        const parsedFechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : undefined;
        const parsedFechaTerminada = fechaTerminada ? new Date(fechaTerminada) : null;

        // También necesitará validación de userId aquí una vez que esté protegida
        const updatedTask = await prisma.task.update({
            where: {
                id: parseInt(id),
                // userId: req.user.userId, // Esto se habilitará cuando la ruta esté protegida y queramos que el usuario solo edite sus tareas
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
            return res.status(404).json({ error: 'Tarea no encontrada.' });
        }

        res.status(200).json(updatedTask);

    } catch (error) {
        console.error('Error al actualizar la tarea:', error);
        res.status(500).json({ error: 'No se pudo actualizar la tarea.', details: error.message });
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // También necesitará validación de userId aquí una vez que esté protegida
        const deletedTask = await prisma.task.delete({
            where: {
                id: parseInt(id),
                // userId: req.user.userId, // Esto se habilitará cuando la ruta esté protegida y queramos que el usuario solo borre sus tareas
            },
        });

        if (!deletedTask) {
            return res.status(404).json({ error: 'Tarea no encontrada.' });
        }

        res.status(204).send();

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
