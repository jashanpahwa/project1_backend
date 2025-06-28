// server.js
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Import models
const User = require('./models/user');
const Activity = require('./models/Activity');
const Stats = require('./models/Stats');


// Server configuration
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://jashanphw:gpBStytHJbWYWNoY@cluster0.bexsfaz.mongodb.net/betx-db?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Create Express app
const app = express();

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Authentication required');

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) throw new Error('User not found');

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

// Add this admin middleware:
const adminAuthenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Authentication required');

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || !user.isAdmin) throw new Error('Admin access required');

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Admin access required' });
  }
};

// Main application setup
const setupApplication = async () => {
  try {
    // Database connection
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

const initializeMasterAdmin = async () => {
  try {
    const masterAdminExists = await User.findOne({ isAdmin: true });
    
    if (!masterAdminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const masterAdmin = new User({
        mobile: '6367073699',
        password: hashedPassword,
        name: 'Master Admin',
        isAdmin: true,
        adminPrivileges: {
          canManageUsers: true,
          canAdjustBalances: true,
          canViewTransactions: true
        },
        balance: 1000000
      });
      
      await masterAdmin.save();
      console.log('Master admin account created successfully');
    }
  } catch (err) {
    console.error('Error initializing master admin:', err);
  }
};  
    // Import and initialize game routes
    const initializeDiceGame = require('./games/diceroll');
    const { Bet, GameSession } = initializeDiceGame(mongoose);
    
    // Pass all required dependencies to the game routes
    const diceGameRoutes = require('./games/diceroll-routes');
    diceGameRoutes(app, { 
      User, 
      Activity, 
      Stats, 
      Bet, 
      GameSession, 
      authenticate,
      JWT_SECRET
    });

    app.get('/', (req, res) => {
      res.type('text/plain').send('Server is running with MongoDB!');
    });

    // Auth Routes
    app.post('/api/auth/login', async (req, res) => {
      try {
        const { mobile, password } = req.body;

        if (!mobile || !password) {
          return res.status(400).json({ error: 'Mobile and password are required' });
        }

        if (!mobile.match(/^[0-9]{10}$/)) {
          return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
        }

        const user = await User.findOne({ mobile });
        if (!user) {
          return res.status(401).json({ error: 'Invalid mobile or password' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
          return res.status(401).json({ error: 'Invalid mobile or password' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token });
      } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
      }
    });

    app.post('/api/auth/register', async (req, res) => {
      try {
        const { mobile, password } = req.body;

        if (!mobile || !password) {
          return res.status(400).json({ error: 'Mobile and password are required' });
        }

        if (!mobile.match(/^[0-9]{10}$/)) {
          return res.status(400).json({ error: 'Invalid mobile number format' });
        }

        if (password.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existingUser = await User.findOne({ mobile });
        if (existingUser) {
          return res.status(409).json({ error: 'Mobile number already registered' });
        }

        const user = new User({ mobile, password });
        await user.save();

        const stats = new Stats({
          userId: user._id,
          totalBets: 0,
          wins: 0,
          losses: 0,
          winRate: '0%'
        });
        await stats.save();

        res.status(201).json({ message: 'Registration successful' });
      } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
      }
    });

    // User Routes
    app.get('/api/auth/me', authenticate, async (req, res) => {
      try {
        res.json({ user: req.user });
      } catch (err) {
        res.status(500).json({ error: 'Server error' });
      }
    });

    app.put('/api/user/update-profile', authenticate, async (req, res) => {
      try {
        const { name, mobile } = req.body;
        const user = req.user;

        if (name) user.name = name;
        if (mobile) {
          if (!mobile.match(/^[0-9]{10}$/)) {
            return res.status(400).json({ error: 'Invalid mobile number format' });
          }
          const existingUser = await User.findOne({ mobile });
          if (existingUser && existingUser._id.toString() !== user._id.toString()) {
            return res.status(409).json({ error: 'Mobile number already registered' });
          }
          user.mobile = mobile;
        }

        await user.save();
        res.json({ message: 'Profile updated successfully', user });
      } catch (err) {
        res.status(500).json({ error: 'Server error' });
      }
    });

    app.get('/api/user/stats', authenticate, async (req, res) => {
      try {
        const stats = await Stats.findOne({ userId: req.user._id });
        if (!stats) {
          const newStats = new Stats({
            userId: req.user._id,
            totalBets: 0,
            wins: 0,
            losses: 0,
            winRate: '0%'
          });
          await newStats.save();
          return res.json(newStats);
        }
        res.json(stats);
      } catch (err) {
        res.status(500).json({ error: 'Server error' });
      }
    });

    app.get('/api/user/activity', authenticate, async (req, res) => {
      try {
        const activities = await Activity.find({ userId: req.user._id })
          .sort({ createdAt: -1 })
          .limit(10);
        res.json(activities);
      } catch (err) {
        res.status(500).json({ error: 'Server error' });
      }
    });

    app.put('/api/user/change-password', authenticate, async (req, res) => {
      try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
          return res.status(400).json({ error: 'Current and new password are required' });
        }

        if (newPassword.length < 8) {
          return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const isMatch = await req.user.comparePassword(currentPassword);
        if (!isMatch) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }

        req.user.password = newPassword;
        await req.user.save();

        res.json({ message: 'Password updated successfully' });
      } catch (err) {
        res.status(500).json({ error: 'Server error' });
      }
    });


  // Admin routes - protect with adminAuthenticate middleware
app.get('/api/admin/users', adminAuthenticate, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/adjust-balance', adminAuthenticate, async (req, res) => {
  try {
    const { userId, amount, type, note } = req.body;
    
    if (!userId || !amount || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const adminUser = req.user; // The admin user making the request

    if (type === 'deposit') {
      // Verify admin has enough balance
      if (adminUser.balance < amount) {
        return res.status(400).json({ error: 'Insufficient admin balance' });
      }
      
      adminUser.balance -= amount;
      user.balance += amount;
    } else if (type === 'withdraw') {
      // Verify user has enough balance
      if (user.balance < amount) {
        return res.status(400).json({ error: 'Insufficient user balance' });
      }
      
      user.balance -= amount;
      adminUser.balance += amount;
    } else {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    // Create transaction record
    const transaction = new Transaction({
      userId: user._id,
      adminId: adminUser._id,
      amount,
      type,
      status: 'completed',
      note: note || `Admin ${type}`
    });

    await Promise.all([
      user.save(),
      adminUser.save(),
      transaction.save()
    ]);

    res.json({ 
      message: 'Balance adjusted successfully',
      user: await User.findById(userId).select('-password')
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});  

  /*  in.comparePassword(password);

*/

    // Start server
    const server = app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}/`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down server...');
      mongoose.connection.close()
        .then(() => server.close(() => {
          console.log('Server closed');
          process.exit(0);
        }));
    });

  } catch (err) {
    console.error('Application startup error:', err);
    process.exit(1);
  }
};

// Start the application
setupApplication();