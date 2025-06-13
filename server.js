require('dotenv').config(); // Cargar variables de entorno desde .env
const express = require('express');
const cors = require('cors'); // Para permitir peticiones desde el frontend de React
const { PrismaClient } = require('@prisma/client'); // Importar el cliente de Prisma

const app = express();
const prisma = new PrismaClient(); // Instanciar Prisma
const PORT = process.env.PORT || 5000; // Puerto donde correrá el servidor

// Middlewares: Son funciones que se ejecutan antes de que la solicitud llegue a las rutas
app.use(cors()); // Habilitar CORS para permitir que tu frontend de React se conecte
app.use(express.json()); // Habilitar el parseo de JSON en las peticiones (para que podamos recibir datos JSON)

// --- Rutas de la API ---

// Ruta de prueba inicial: Para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('¡La API de ZenMatrix está funcionando! 🎉');
});

// Ruta para crear una nueva tarea
app.post('/api/tasks', async (req, res) => {
    try {
        // Extraer los datos de la tarea del cuerpo de la petición (req.body)
        // Asegúrate de que los nombres de los campos coincidan con tu schema.prisma
        const { proyecto, responsable, titulo, descripcion, fechaVencimiento, prioridad } = req.body;

        // Validaciones básicas (puedes añadir más robustas después)
        if (!titulo || !proyecto || !responsable || !prioridad) {
            return res.status(400).json({ error: 'Faltan campos obligatorios: titulo, proyecto, responsable, prioridad.' });
        }

        // Convertir fechaVencimiento a Date si existe
        const parsedFechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : undefined;

        // Crear la tarea en la base de datos usando Prisma
        const newTask = await prisma.task.create({
            data: {
                proyecto,
                responsable,
                titulo,
                descripcion,
                fechaVencimiento: parsedFechaVencimiento,
                prioridad,
                // isCompleted y fechaInicio tienen valores por defecto en el schema
            },
        });

        // Enviar la nueva tarea creada como respuesta con estado 201 (Creado)
        res.status(201).json(newTask);

    } catch (error) {
        console.error('Error al crear la tarea:', error);
        res.status(500).json({ error: 'No se pudo crear la tarea.', details: error.message });
    }
});

// Ruta para obtener todas las tareas
app.get('/api/tasks', async (req, res) => {
    try {
        // Obtener todas las tareas de la base de datos usando Prisma
        const tasks = await prisma.task.findMany();

        // Enviar las tareas como respuesta
        res.status(200).json(tasks);

    } catch (error) {
        console.error('Error al obtener las tareas:', error);
        res.status(500).json({ error: 'No se pudieron obtener las tareas.', details: error.message });
    }
});

// Ruta para actualizar una tarea por su ID
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params; // Obtener el ID de los parámetros de la URL
        // Extraer los datos actualizados del cuerpo de la petición
        const { proyecto, responsable, titulo, descripcion, fechaVencimiento, fechaTerminada, prioridad, isCompleted } = req.body;

        // Convertir fechas a Date si existen
        const parsedFechaVencimiento = fechaVencimiento ? new Date(fechaVencimiento) : undefined;
        const parsedFechaTerminada = fechaTerminada ? new Date(fechaTerminada) : undefined;

        // Actualizar la tarea en la base de datos usando Prisma
        const updatedTask = await prisma.task.update({
            where: {
                id: parseInt(id), // Convertir el ID de string a número entero
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

        // Enviar la tarea actualizada como respuesta
        res.status(200).json(updatedTask);

    } catch (error) {
        console.error('Error al actualizar la tarea:', error);
        res.status(500).json({ error: 'No se pudo actualizar la tarea.', details: error.message });
    }
});

// Ruta para eliminar una tarea por su ID
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params; // Obtener el ID de los parámetros de la URL

        // Eliminar la tarea de la base de datos usando Prisma
        const deletedTask = await prisma.task.delete({
            where: {
                id: parseInt(id), // Convertir el ID de string a número entero
            },
        });

        if (!deletedTask) {
            return res.status(404).json({ error: 'Tarea no encontrada.' });
        }

        // Enviar un mensaje de éxito (204 No Content es común para DELETE exitoso)
        res.status(204).send(); // No se envía contenido en el cuerpo, solo el estado

    } catch (error) {
        console.error('Error al eliminar la tarea:', error);
        res.status(500).json({ error: 'No se pudo eliminar la tarea.', details: error.message });
    }
});

// --- Fin de Rutas de la API ---


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de ZenMatrix API corriendo en http://localhost:${PORT}`);
    console.log('✅ Conectado a la base de datos MySQL con Prisma.');
});

// Manejo de cierre de Prisma (opcional, pero buena práctica para cerrar la conexión a la DB)
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});