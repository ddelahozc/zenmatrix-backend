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