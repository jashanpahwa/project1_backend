// server.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();


// Server configuration
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://jashanphw:gpBStytHJbWYWNoY@cluster0.bexsfaz.mongodb.net/betx-db?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Create Express app
const app = express();

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000'); // Your React app's URL
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

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, default: 'User' },
    mobile: { 
    type: String, 
    required: true, 
    unique: true,
    validate: {
      validator: function(v) {
        return /^[0-9]{10}$/.test(v);
      },
      message: props => `${props.value} is not a valid mobile number!`
    }
  },
  email: { type: String }, // Optional email
  password: { type: String, required: true },
  verified: { type: Boolean, default: false },
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
});

// Activity Schema
const activitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['login', 'bet', 'deposit', 'withdrawal'], required: true },
  amount: { type: Number },
  game: { type: String },
  outcome: { type: String },
  method: { type: String },
  status: { type: String },
  device: { type: String },
  location: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Stats Schema (virtual collection)
const statsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalBets: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  winRate: { type: String, default: '0%' }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
const Activity = mongoose.model('Activity', activitySchema);
const Stats = mongoose.model('Stats', statsSchema);

// MongoDB connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

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

// Routes
app.get('/', (req, res) => {
  res.type('text/plain').send('Server is running with MongoDB!');
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { mobile, password } = req.body;

    // Validate input
    if (!mobile || !password) {
      return res.status(400).json({ error: 'Mobile and password are required' });
    }

    if (!mobile.match(/^[0-9]{10}$/)) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    }

    // Find user
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(401).json({ error: 'Invalid mobile or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid mobile or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });

    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { mobile, password } = req.body;

    // Validation
    if (!mobile || !password) {
      return res.status(400).json({ error: 'Mobile and password are required' });
    }

    if (!mobile.match(/^[0-9]{10}$/)) {
      return res.status(400).json({ error: 'Invalid mobile number format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(409).json({ error: 'Mobile number already registered' });
    }

    // Create new user
    const user = new User({
      mobile,
      password // Will be hashed automatically by the pre-save hook
    });

    await user.save();

    // Create default stats
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

// Get user profile
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile (mobile and name only)
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

// Get user stats
app.get('/api/user/stats', authenticate, async (req, res) => {
  try {
    const stats = await Stats.findOne({ userId: req.user._id });
    if (!stats) {
      // Create default stats if not found
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

// Get user activity
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

// Change password
app.put('/api/user/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check current password
    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    req.user.password = newPassword;
    await req.user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

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

