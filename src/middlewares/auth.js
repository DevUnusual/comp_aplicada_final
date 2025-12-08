import jwt from 'jsonwebtoken';
import db from '../config/database.js';

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Access denied. No token provided.' 
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = db.findUserById(decoded.userId);

        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid token. User not found.' 
            });
        }

        if (!user.isActive) {
            return res.status(401).json({ 
                error: 'User account is deactivated.' 
            });
        }

        req.user = user;
        req.userId = user.id;

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token.' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired.' });
        }
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication error.' });
    }
}

/**
 * Generate JWT token for user
 */
export function generateToken(userId) {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = db.findUserById(decoded.userId);
            
            if (user && user.isActive) {
                req.user = user;
                req.userId = user.id;
            }
        }
        
        next();
    } catch (error) {
        next();
    }
}

export default { authenticate, generateToken, optionalAuth };
