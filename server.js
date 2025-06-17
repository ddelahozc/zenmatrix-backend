require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Middlewares
app.use(cors());
app.use(express.json());

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
            data: { email, password: hashedPassword, role: "USER" }
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
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
        const { password: userPassword, ...userWithoutPassword } = user;
        res.status(200).json({ message: 'Inicio de sesión exitoso', token, user: userWithoutPassword });
    } catch (error) {
        console.error('Error en el inicio de sesión:', error);
        res.status(500).json({ error: 'No se pudo iniciar sesión.', details: error.message });
    }
});

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) {
        return res.status(401).json({ error: 'Token no proporcionado.' });
    }
    jwt.verify(token, JWT_SECRET, async (err, userPayload) => {
        if (err) {
            console.error('Error al verificar token:', err);
            return res.status(403).json({ error: 'Token inválido o expirado.' });
        }
        const user = await prisma.user.findUnique({ where: { id: userPayload.userId } });
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        req.user = { userId: user.id, role: user.role };
        next();
    });
};

// Rutas de Tareas Protegidas y con Lógica de Rol
app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { proyecto, responsable, titulo, descripcion, fechaVencimiento, prioridad } = req.body;
        if (!titulo || !proyecto || !responsable || !prioridad) {
            return res.status(400).json({ error: 'Faltan campos obligatorios: titulo, proyecto, responsable, prioridad.' });
        }
        const parsedFechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : undefined;
        const newTask = await prisma.task.create({
            data: { proyecto, responsable, titulo, descripcion, fechaVencimiento: parsedFechaVencimiento, prioridad, userId: userId }
        });
        res.status(201).json(newTask);
    } catch (error) {
        console.error('Error al crear la tarea:', error);
        res.status(500).json({ error: 'No se pudo crear la tarea.', details: error.message });
    }
});

app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { userId, role } = req.user;
        const { search, priority, isCompleted, proyecto, sortBy, sortDirection, page, limit } = req.query;

        const whereClause = {};
        if (role !== 'ADMIN') {
            whereClause.userId = userId;
        }

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
            orderByClause = { [sortBy]: sortDirection };
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
            // NUEVO: Incluir la información del usuario propietario de la tarea
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        role: true
                    }
                }
            }
        });

        res.status(200).json({ tasks, totalCount, currentPage: pageNum, limit: limitNum, totalPages: Math.ceil(totalCount / limitNum) });
    } catch (error) {
        console.error('Error al obtener las tareas con filtros, ordenamiento y paginación:', error);
        res.status(500).json({ error: 'No se pudieron obtener las tareas.', details: error.message });
    }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.user;
        const { proyecto, responsable, titulo, descripcion, fechaVencimiento, fechaTerminada, prioridad, isCompleted } = req.body;
        const parsedFechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : undefined;
        const parsedFechaTerminada = fechaTerminada ? new Date(fechaTerminada) : null;
        const taskWhereClause = { id: parseInt(id) };
        if (role !== 'ADMIN') {
            taskWhereClause.userId = userId;
        }
        const updatedTask = await prisma.task.update({
            where: taskWhereClause,
            data: { proyecto, responsable, titulo, descripcion, fechaVencimiento: parsedFechaVencimiento, fechaTerminada: parsedFechaTerminada, prioridad, isCompleted }
        });
        if (!updatedTask) {
            return res.status(404).json({ error: 'Tarea no encontrada o no tienes permiso para actualizarla.' });
        }
        res.status(200).json(updatedTask);
    } catch (error) {
        console.error('Error al actualizar la tarea:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Tarea no encontrada o no tienes permiso para actualizarla.' });
        }
        res.status(500).json({ error: 'No se pudo actualizar la tarea.', details: error.message });
    }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.user;
        const taskWhereClause = { id: parseInt(id) };
        if (role !== 'ADMIN') {
            taskWhereClause.userId = userId;
        }
        const deletedTask = await prisma.task.delete({
            where: taskWhereClause,
        });
        if (!deletedTask) {
            return res.status(404).json({ error: 'Tarea no encontrada o no tienes permiso para eliminarla.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error al eliminar la tarea:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Tarea no encontrada o no tienes permiso para eliminarla.' });
        }
        res.status(500).json({ error: 'No se pudo eliminar la tarea.', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor de ZenMatrix API corriendo en http://localhost:${PORT}`);
    console.log('✅ Conectado a la base de datos MySQL con Prisma.');
});

process.on('beforeExit', async () => {
    await prisma.$disconnect();
});
