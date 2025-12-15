// src/models/index.js

import sequelize from '../config/db.js';

// --- IMPORTACIÓN DE MODELOS ---
import User from './user.model.js';
import Role from './role.model.js';
import Session from './session.model.js';
import Company from './company.model.js';
import UserInvitation from './userInvitation.model.js';
import Category from './category.model.js';
import Subcategory from './subcategory.model.js';
import InitialBalance from './initialBalance.model.js';
import CashFlowTransaction from './cashFlowTransaction.model.js';
import Evidence from './evidence.model.js';
import PaymentMethod from './paymentMethod.model.js';

const db = {};

// --- ADJUNTAR MODELOS AL OBJETO DB ---
db.User = User;
db.Role = Role;
db.Session = Session;
db.Company = Company;
db.UserInvitation = UserInvitation;
db.Category = Category;
db.Subcategory = Subcategory;
db.InitialBalance = InitialBalance;
db.CashFlowTransaction = CashFlowTransaction;
db.Evidence = Evidence;
db.PaymentMethod = PaymentMethod;

// ===================================
// === DEFINICIÓN DE ASOCIACIONES ====
// ===================================

// --- 1. ASOCIACIONES DE COMPAÑÍAS ---

// Una Compañía tiene muchos Usuarios (Company.company_id -> User.company_id)
db.Company.hasMany(db.User, { 
    foreignKey: 'company_id', 
    as: 'users',
    onDelete: 'RESTRICT', // No permitir eliminar una compañía con usuarios
});
db.User.belongsTo(db.Company, { 
    foreignKey: 'company_id', 
    as: 'company',
});

// Una Compañía tiene muchas Invitaciones (Company.company_id -> UserInvitation.company_id)
db.Company.hasMany(db.UserInvitation, { 
    foreignKey: 'company_id', 
    as: 'invitations',
    onDelete: 'CASCADE', // Si se elimina una compañía, se eliminan sus invitaciones
});
db.UserInvitation.belongsTo(db.Company, { 
    foreignKey: 'company_id', 
    as: 'company',
});

// Una Compañía tiene muchos Saldos Iniciales (Company.company_id -> InitialBalance.company_id)
db.Company.hasMany(db.InitialBalance, { 
    foreignKey: 'company_id', 
    as: 'initialBalances',
    onDelete: 'RESTRICT',
});
db.InitialBalance.belongsTo(db.Company, { 
    foreignKey: 'company_id', 
    as: 'company',
});

// Una Compañía tiene muchas Transacciones (Company.company_id -> CashFlowTransaction.company_id)
db.Company.hasMany(db.CashFlowTransaction, { 
    foreignKey: 'company_id', 
    as: 'transactions',
    onDelete: 'RESTRICT',
});
db.CashFlowTransaction.belongsTo(db.Company, { 
    foreignKey: 'company_id', 
    as: 'company',
});

// --- 2. ASOCIACIONES DE AUTENTICACIÓN Y USUARIOS ---

// Un Rol tiene muchos Usuarios (Role.role_id -> User.role_id)
db.Role.hasMany(db.User, { 
    foreignKey: 'role_id', 
    as: 'users',
    onDelete: 'RESTRICT',
});
db.User.belongsTo(db.Role, { 
    foreignKey: 'role_id', 
    as: 'role',
});

// Un Usuario puede tener muchas Sesiones (User.user_id -> Session.user_id)
db.User.hasMany(db.Session, { 
    foreignKey: 'user_id', 
    as: 'sessions',
    onDelete: 'CASCADE', // Si se elimina un usuario, se eliminan sus sesiones
});
db.Session.belongsTo(db.User, { 
    foreignKey: 'user_id', 
    as: 'user',
});

// --- 3. ASOCIACIONES DE INVITACIONES ---

// Un Usuario (Admin) puede enviar muchas Invitaciones (User.user_id -> UserInvitation.invited_by_user_id)
db.User.hasMany(db.UserInvitation, { 
    foreignKey: 'invited_by_user_id', 
    as: 'sentInvitations',
    onDelete: 'CASCADE',
});
db.UserInvitation.belongsTo(db.User, { 
    foreignKey: 'invited_by_user_id', 
    as: 'invitedBy',
});

// Un Rol puede estar en muchas Invitaciones (Role.role_id -> UserInvitation.role_id)
db.Role.hasMany(db.UserInvitation, { 
    foreignKey: 'role_id', 
    as: 'invitations',
    onDelete: 'RESTRICT',
});
db.UserInvitation.belongsTo(db.Role, { 
    foreignKey: 'role_id', 
    as: 'role',
});

// --- 4. ASOCIACIONES DEL MÓDULO DE FLUJO DE CAJA ---

// Una Categoría tiene muchas Subcategorías (Category.category_id -> Subcategory.category_id)
db.Category.hasMany(db.Subcategory, { 
    foreignKey: 'category_id', 
    as: 'subcategories',
    onDelete: 'RESTRICT',
});
db.Subcategory.belongsTo(db.Category, { 
    foreignKey: 'category_id', 
    as: 'category',
});

// Un Usuario crea muchas Transacciones (User.user_id -> CashFlowTransaction.user_id)
db.User.hasMany(db.CashFlowTransaction, { 
    foreignKey: 'user_id', 
    as: 'transactions',
    onDelete: 'RESTRICT',
});
db.CashFlowTransaction.belongsTo(db.User, { 
    foreignKey: 'user_id', 
    as: 'user',
});

// Una Subcategoría está en muchas Transacciones (Subcategory.subcategory_id -> CashFlowTransaction.subcategory_id)
db.Subcategory.hasMany(db.CashFlowTransaction, { 
    foreignKey: 'subcategory_id', 
    as: 'transactions',
    onDelete: 'RESTRICT',
});
db.CashFlowTransaction.belongsTo(db.Subcategory, { 
    foreignKey: 'subcategory_id', 
    as: 'subcategory',
});

// Un Método de Pago está en muchas Transacciones (PaymentMethod.method_id -> CashFlowTransaction.method_id)
db.PaymentMethod.hasMany(db.CashFlowTransaction, {
    foreignKey: 'method_id',
    as: 'transactions',
    onDelete: 'RESTRICT',
});
db.CashFlowTransaction.belongsTo(db.PaymentMethod, {
    foreignKey: 'method_id',
    as: 'paymentMethod',
});

// Una Transacción puede tener muchas Evidencias (CashFlowTransaction.transaction_id -> Evidence.transaction_id)
db.CashFlowTransaction.hasMany(db.Evidence, {
    foreignKey: 'transaction_id',
    as: 'evidences',
    onDelete: 'CASCADE', // Si se elimina una transacción, se elimina su evidencia
});
db.Evidence.belongsTo(db.CashFlowTransaction, { 
    foreignKey: 'transaction_id', 
    as: 'transaction',
});

// ===================================

// Adjuntamos la instancia de Sequelize
db.sequelize = sequelize;

export default db;