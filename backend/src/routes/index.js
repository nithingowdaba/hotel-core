'use strict';

const { Router } = require('express');
const authRoutes = require('./auth');
const hotelsRoutes = require('./hotels');
const menuRoutes = require('./menu');
const platformRoutes = require('./platform');
const ordersRoutes = require('./orders');
const meRoutes = require('./me');
const reportsRoutes = require('./reports');
const { setRoutePrefix } = require('../middleware/metrics');

const router = Router();
router.use('/auth', setRoutePrefix, authRoutes);
router.use('/hotels', setRoutePrefix, hotelsRoutes);
router.use('/hotels', setRoutePrefix, menuRoutes);
router.use('/hotels', setRoutePrefix, ordersRoutes);
router.use('/hotels', setRoutePrefix, reportsRoutes);
router.use('/me', setRoutePrefix, meRoutes);
router.use('/platform', setRoutePrefix, platformRoutes);

module.exports = router;
