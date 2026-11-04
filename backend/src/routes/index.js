'use strict';

const { Router } = require('express');
const authRoutes = require('./auth');
const hotelsRoutes = require('./hotels');
const menuRoutes = require('./menu');
const platformRoutes = require('./platform');

const router = Router();
router.use('/auth', authRoutes);
router.use('/hotels', hotelsRoutes);
router.use('/hotels', menuRoutes);
router.use('/platform', platformRoutes);

module.exports = router;
