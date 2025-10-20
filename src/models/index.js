// src/models/index.js

import sequelize from '../config/db.js';

// --- IMPORTACIÓN DE MODELOS ---
import User from './user.model.js';
import Role from './role.model.js';
import Session from './session.model.js';
import Category from './category.model.js';
import Subcategory from './subcategory.model.js';
import MonthlyBalance from './monthlyBalance.model.js';
import CashFlowTransaction from './cashFlowTransaction.model.js';
import Evidence from './evidence.model.js';
import PaymentMethod from './paymentMethod.model.js';

const db = {};

// --- ADJUNTAR MODELOS AL OBJETO DB ---
db.User = User;
db.Role = Role;
db.Session = Session;
db.Category = Category;
db.Subcategory = Subcategory;
db.MonthlyBalance = MonthlyBalance;
db.CashFlowTransaction = CashFlowTransaction;
db.Evidence = Evidence;
db.PaymentMethod = PaymentMethod;

// ===================================
// === DEFINICIÓN DE ASOCIACIONES ====
// ===================================

// --- ASOCIACIONES DE AUTENTICACIÓN Y USUARIOS ---

// Un Usuario pertenece a un Rol (User.role_id -> Role.role_id)
db.Role.hasMany(db.User, { foreignKey: 'role_id', as: 'users' });
db.User.belongsTo(db.Role, { foreignKey: 'role_id', as: 'role' });

// Un Usuario puede tener muchas Sesiones (User.user_id -> Session.user_id)
db.User.hasMany(db.Session, { foreignKey: 'user_id', as: 'sessions' });
db.Session.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' });

// --- ASOCIACIONES DEL MÓDULO DE FLUJO DE CAJA ---

// Una Categoría tiene muchas Subcategorías (Category.category_id -> Subcategory.category_id)
db.Category.hasMany(db.Subcategory, { foreignKey: 'category_id', as: 'subcategories' });
db.Subcategory.belongsTo(db.Category, { foreignKey: 'category_id', as: 'category' });

// Un Usuario crea muchas Transacciones (User.user_id -> CashFlowTransaction.user_id)
db.User.hasMany(db.CashFlowTransaction, { foreignKey: 'user_id', as: 'transactions' });
db.CashFlowTransaction.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' });

// Una Subcategoría está en muchas Transacciones (Subcategory.subcategory_id -> CashFlowTransaction.subcategory_id)
db.Subcategory.hasMany(db.CashFlowTransaction, { foreignKey: 'subcategory_id', as: 'transactions' });
db.CashFlowTransaction.belongsTo(db.Subcategory, { foreignKey: 'subcategory_id', as: 'subcategory' });

// Un Método de Pago está en muchas Transacciones (PaymentMethod.method_id -> CashFlowTransaction.method_id)
db.PaymentMethod.hasMany(db.CashFlowTransaction, {
    foreignKey: 'method_id',
    as: 'transactions',
});
db.CashFlowTransaction.belongsTo(db.PaymentMethod, {
    foreignKey: 'method_id',
    as: 'paymentMethod',
});

// Una Transacción puede tener muchas Evidencias (CashFlowTransaction.transaction_id -> Evidence.transaction_id)
// Se usa hasMany porque el FK en la tabla 'evidences' no es único.
db.CashFlowTransaction.hasMany(db.Evidence, {
    foreignKey: 'transaction_id',
    as: 'evidences',
    onDelete: 'CASCADE', // Si se elimina una transacción, se elimina su evidencia.
});
db.Evidence.belongsTo(db.CashFlowTransaction, { foreignKey: 'transaction_id', as: 'transaction' });

// ===================================

// Adjuntamos la instancia de Sequelize
db.sequelize = sequelize;

export default db;