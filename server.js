const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'cafe-rewards-secret-change-me',
  resave: false,
  saveUninitialized: false,
}));

app.get('/', (req, res) => res.render('index'));
app.use(authRoutes);
app.use(memberRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cafe Rewards running on http://localhost:${PORT}`));