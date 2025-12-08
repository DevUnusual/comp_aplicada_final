import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import { generateToken } from '../middlewares/auth.js';

/**
 * Register a new user
 * POST /api/auth/register
 */
export async function register(req, res) {
    try {
        const { fullName, username, email, password, description } = req.body;

        if (!fullName || !username || !email || !password) {
            return res.status(400).json({ 
                error: 'All fields are required: fullName, username, email, password' 
            });
        }

        // Check if user already exists
        if (db.findUserByEmail(email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        if (db.findUserByUsername(username)) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = db.createUser({
            id: uuidv4(),
            fullName,
            username,
            email,
            password: hashedPassword,
            description: description || null,
            profileImage: null,
            isActive: true
        });

        const token = generateToken(user.id);

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        res.status(201).json({
            message: 'User registered successfully',
            user: userWithoutPassword,
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
}

/**
 * Login user
 * POST /api/auth/login
 */
export async function login(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password are required' 
            });
        }

        const user = db.findUserByUsernameOrEmail(username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ error: 'Account is deactivated' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user.id);

        const { password: _, ...userWithoutPassword } = user;

        res.json({
            message: 'Login successful',
            user: userWithoutPassword,
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to login' });
    }
}

/**
 * Get current user profile
 * GET /api/auth/profile
 */
export async function getProfile(req, res) {
    try {
        const { password: _, ...userWithoutPassword } = req.user;
        res.json({ user: userWithoutPassword });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
}

/**
 * Update user profile
 * PUT /api/auth/profile
 */
export async function updateProfile(req, res) {
    try {
        const { fullName, email, description, profileImage } = req.body;

        if (email && email !== req.user.email) {
            if (db.findUserByEmail(email)) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (email) updates.email = email;
        if (description !== undefined) updates.description = description;
        if (profileImage !== undefined) updates.profileImage = profileImage;

        const updatedUser = db.updateUser(req.userId, updates);

        const { password: _, ...userWithoutPassword } = updatedUser;

        res.json({
            message: 'Profile updated successfully',
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
}

/**
 * Change password
 * PUT /api/auth/password
 */
export async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                error: 'Current password and new password are required' 
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ 
                error: 'New password must be at least 6 characters' 
            });
        }

        const isValid = await bcrypt.compare(currentPassword, req.user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        db.updateUser(req.userId, { password: hashedPassword });

        const token = generateToken(req.userId);

        res.json({
            message: 'Password changed successfully',
            token
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
}

export default {
    register,
    login,
    getProfile,
    updateProfile,
    changePassword
};
