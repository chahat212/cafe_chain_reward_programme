const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const clockRoutes = require('./routes/clock');
const outboxRoutes = require('./routes/outbox');

const app = express();

app.set('view engine', 'ejs');

app.set(
  'views',
  path.join(__dirname, 'views')
);

app.use(express.urlencoded({
  extended: true
}));

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

app.use(session({
  secret:
    process.env.SESSION_SECRET ||
    'development-secret-change-this',

  resave: false,

  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
}));


app.get('/', (req, res) => {
  res.render('index');
});


app.use(authRoutes);

app.use(memberRoutes);

app.use(clockRoutes);

app.use(outboxRoutes);


const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Cafe Rewards running on http://localhost:${PORT}`
  );
});