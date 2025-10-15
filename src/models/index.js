// src/models/index.js

import sequelize from '../config/db.js';
import User from './user.model.js';
import Role from './role.model.js';
import Session from './session.model.js'; // <-- AÑADIR

const db = {};

// Adjuntamos los modelos al objeto db
db.User = User;
db.Role = Role;
db.Session = Session; // <-- AÑADIR

// --- DEFINICIÓN DE ASOCIACIONES ---

// Un Usuario pertenece a un Rol (User.role_id -> Role.role_id)
db.Role.hasMany(db.User, { foreignKey: 'role_id', as: 'users' });
db.User.belongsTo(db.Role, { foreignKey: 'role_id', as: 'role' });

// Un Usuario puede tener muchas Sesiones (User.user_id -> Session.user_id)
db.User.hasMany(db.Session, { foreignKey: 'user_id', as: 'sessions' });
db.Session.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' });

// Futuras asociaciones se definirán aquí...

// Adjuntamos la instancia de Sequelize
db.sequelize = sequelize;

export default db;