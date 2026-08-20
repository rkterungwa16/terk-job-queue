import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { UserRole } from '../../types/auth.types.js';

export interface UserAttrs {
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserAttrs>;

const UserSchema = new Schema<UserAttrs>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'] satisfies UserRole[], default: 'user' },
  },
  { timestamps: true },
);

// `unique: true` above already creates the index this collection needs for
// both login lookups (by email) and duplicate-registration checks.

export const UserModel: Model<UserAttrs> = mongoose.model<UserAttrs>('User', UserSchema);
