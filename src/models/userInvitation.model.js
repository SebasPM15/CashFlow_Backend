// src/models/userInvitation.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const UserInvitation = sequelize.define('UserInvitation', {
    invitation_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    company_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    invited_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    invited_email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            isEmail: true,
        },
    },
    invitation_code: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
    },
    invitation_token: {
        type: DataTypes.STRING(500),
        allowNull: false,
        unique: true,
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    is_used: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    used_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'user_invitations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // La tabla no tiene updated_at
    indexes: [
        {
            unique: true,
            fields: ['company_id', 'invited_email', 'is_used'],
            name: 'uniq_active_invitation_per_email_company',
        },
    ],
});

export default UserInvitation;