const User = require('../models/user');
const jwt = require('jsonwebtoken');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { mobile, password } = req.body;

    // Validate mobile number format
    if (!mobile.match(/^[0-9]{10}$/)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please enter a valid 10-digit mobile number' 
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mobile number already registered' 
      });
    }

    // Create user
    const user = await User.create({ mobile, password });

    // Create token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE
    });

    res.status(201).json({ 
      success: true, 
      token,
      user: {
        id: user._id,
        mobile: user.mobile
      }
    });
  } catch (err) {
    next(err);
  }
};


// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { mobile, password } = req.body;

    // Validate mobile & password
    if (!mobile || !password) {
      return res.status(400).json({ success: false, error: 'Please provide mobile and password' });
    }

    // Check for user
    const user = await User.findOne({ mobile }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Create token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE
    });

    res.status(200).json({ 
      success: true, 
      token,
      user: {
        id: user._id,
        mobile: user.mobile
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      user
    });
  } catch (err) {
    next(err);
  }
};