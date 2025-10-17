// src/services/storage.service.js

import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../utils/ApiError.js';
import config from '../config/index.js';
import httpStatus from 'http-status';
import logger from '../utils/logger.js';

// Inicializamos el cliente de Supabase una sola vez (patrón Singleton)
const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

/**
 * Sube un archivo de evidencia a Supabase Storage.
 * @param {Buffer} fileBuffer - El buffer del archivo a subir.
 * @param {string} fileName - El nombre original del archivo.
 * @param {number} userId - El ID del usuario para organizar la carpeta.
 * @returns {Promise<string>} La ruta del archivo dentro del bucket.
 */
const uploadEvidence = async (fileBuffer, fileName, userId) => {
    // Creamos una ruta organizada para identificar al usuario dueño del archivo.
    const filePath = `${userId}/${Date.now()}-${fileName}`;

    const { data, error } = await supabase.storage
        .from(config.supabase.bucketName)
        .upload(filePath, fileBuffer, {
            // Supabase infiere el contentType, pero es buena práctica ser explícito si se puede.
            // contentType: mimeType, 
            cacheControl: '3600',
            upsert: false, // No sobrescribir si ya existe (aunque nuestro nombre es único)
        });

    if (error) {
        logger.error('Error al subir archivo a Supabase Storage:', error);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'No se pudo guardar la evidencia.');
    }

    return data.path; // Retornamos la ruta del archivo en el bucket
};

/**
 * Elimina un archivo de evidencia de Supabase Storage.
 * @param {string} filePath - La ruta del archivo a eliminar en el bucket.
 */
const deleteEvidence = async (filePath) => {
    const { error } = await supabase.storage
        .from(config.supabase.bucketName)
        .remove([filePath]);

    if (error) {
        // No lanzamos un error fatal, solo advertimos, para no bloquear otras operaciones.
        logger.warn(`No se pudo eliminar la evidencia antigua de Supabase: ${filePath}`, error);
    }
};

export const storageService = {
    uploadEvidence,
    deleteEvidence,
};