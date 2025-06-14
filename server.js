require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.env || 5000; // Corregido: PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba inicial
app.get('/', (req, res) => {
    res.send('¡La API de ZenMatrix está funcionando! 🎉');
});

// Ruta para crear una nueva tarea
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
            },
        });

        res.status(201).json(newTask);

    } catch (error) {
        console.error('Error al crear la tarea:', error);
        res.status(500).json({ error: 'No se pudo crear la tarea.', details: error.message });
    }
});

// --- RUTA ACTUALIZADA PARA OBTENER TAREAS CON FILTROS Y BÚSQUEDA ---
app.get('/api/tasks', async (req, res) => {
    try {
        // Obtener parámetros de consulta de la URL
        const { search, priority, isCompleted, proyecto } = req.query;

        // Construir el objeto 'where' para Prisma dinámicamente
        const whereClause = {};

        // Filtro por término de búsqueda (título o descripción)
        if (search) {
            whereClause.OR = [
                // Eliminado: mode: 'insensitive' - NO SOPORTADO EN MYSQL CON CONTAINS
                { titulo: { contains: search } },
                { descripcion: { contains: search } },
            ];
        }

        // Filtro por prioridad
        if (priority) {
            whereClause.prioridad = priority;
        }

        // Filtro por estado de completado
        if (isCompleted !== undefined && isCompleted !== null && isCompleted !== '') {
            whereClause.isCompleted = isCompleted === 'true'; // Convertir string 'true'/'false' a booleano
        }

        // Nuevo: Filtro por proyecto
        if (proyecto) {
            // Eliminado: mode: 'insensitive' - NO SOPORTADO EN MYSQL CON CONTAINS
            whereClause.proyecto = { contains: proyecto };
        }

        // Obtener tareas de la base de datos usando Prisma con el filtro aplicado
        const tasks = await prisma.task.findMany({
            where: whereClause,
            orderBy: {
                createdAt: 'desc', // Opcional: ordenar por fecha de creación descendente
            },
        });

        res.status(200).json(tasks);

    } catch (error) {
        console.error('Error al obtener las tareas con filtros:', error);
        res.status(500).json({ error: 'No se pudieron obtener las tareas.', details: error.message });
    }
});
// --- FIN DE RUTA ACTUALIZADA ---

// Ruta para actualizar una tarea por su ID
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { proyecto, responsable, titulo, descripcion, fechaVencimiento, fechaTerminada, prioridad, isCompleted } = req.body;

        const parsedFechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : undefined;
        // Solo parsear fechaTerminada si no es null
        const parsedFechaTerminada = fechaTerminada ? new Date(fechaTerminada) : null;


        const updatedTask = await prisma.task.update({
            where: {
                id: parseInt(id),
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

// Ruta para eliminar una tarea por su ID
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deletedTask = await prisma.task.delete({
            where: {
                id: parseInt(id),
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
