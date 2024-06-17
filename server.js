const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken
const path = require('path');
const saltRounds = 10;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;
const dbURI = 'mongodb://localhost:27017/chatbox';
const jwtSecret = 'your_jwt_secret'; // Secret key for JWT

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(dbURI, {
	useNewUrlParser: true,
	useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', function() {
	console.log('Connected to MongoDB');
});

// Define User schema and model
const userSchema = new mongoose.Schema({
	username: {
		type: String,
		unique: true,
		required: true
	},
	password: {
		type: String,
		required: true
	},
	isAdmin: {
		type: Boolean,
		default: false
	}
});

const User = mongoose.model('User', userSchema);

// Define Message schema and model
const messageSchema = new mongoose.Schema({
	username: {
		type: String,
		required: true
	},
	message: {
		type: String,
		required: true
	},
	timestamp: {
		type: Date,
		default: Date.now
	}
});
const Message = mongoose.model('Message', messageSchema);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.post('/register', async (req, res) => {
	try {
		const { username, password } = req.body;
		const hashedPassword = await bcrypt.hash(password, saltRounds);
		const newUser = new User({
			username,
			password: hashedPassword,
			isAdmin: false // Always set isAdmin to false
		});
		await newUser.save();
		res.status(201).send('User registered successfully');
	} catch (err) {
		res.status(500).send(err.message);
	}
});

app.post('/login', async (req, res) => {
	try {
		const { username, password } = req.body;
		const user = await User.findOne({ username });

		if (user) {
			const match = await bcrypt.compare(password, user.password);
			if (match) {
				// Generate JWT token
				const token = jwt.sign({ username: user.username, isAdmin: user.isAdmin }, jwtSecret, { expiresIn: '1d' });
				res.status(200).json({
					token,
					username: user.username,
					isAdmin: user.isAdmin
				});
			} else {
				res.status(401).json({ error: 'Invalid username or password' });
			}
		} else {
			res.status(401).json({ error: 'Invalid username or password' });
		}
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
	const token = req.headers['authorization']?.split(' ')[1];
	if (!token) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	jwt.verify(token, jwtSecret, (err, user) => {
		if (err) {
			return res.status(403).json({ error: 'Forbidden' });
		}
		req.user = user;
		next();
	});
};

// Route to save messages
app.post('/send-message', verifyToken, async (req, res) => {
	try {
		const { message } = req.body;
		const newMessage = new Message({
			username: req.user.username,
			message
		});
		await newMessage.save();

		// Emit new message to all connected clients
		io.emit('message', newMessage);

		console.log('Message saved:', newMessage);
		res.status(201).send('Message sent successfully');
	} catch (err) {
		console.error('Error saving message:', err);
		res.status(500).send(err.message);
	}
});

// Route to get all messages
app.get('/get-messages', verifyToken, async (req, res) => {
	try {
		const messages = await Message.find().sort({ timestamp: 1 });
		console.log('Messages retrieved:', messages);
		res.status(200).json(messages);
	} catch (err) {
		console.error('Error retrieving messages:', err);
		res.status(500).send(err.message);
	}
});

app.get('/users', verifyToken, async (req, res) => {
	try {
		const users = await User.find({}, 'username isAdmin');
		res.status(200).json(users);
	} catch (err) {
		console.error('Error retrieving users:', err);
		res.status(500).send(err.message);
	}
});

// Middleware to verify password for admin actions
const verifyPassword = async (req, res, next) => {
	try {
		const { password } = req.body;
		const user = await User.findOne({ username: req.user.username });

		if (!user) {
			return res.status(401).json({ error: 'Invalid username or password' });
		}

		const match = await bcrypt.compare(password, user.password);
		if (!match) {
			return res.status(401).json({ error: 'Invalid username or password' });
		}

		// Store the user object and password match status for use in subsequent handlers
		req.userData = { user, passwordMatch: match };
		next();
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

app.post('/promote-to-admin', verifyToken, verifyPassword, async (req, res) => {
	try {
		const { username } = req.body;
		const { user } = req.userData;

		if (!user.isAdmin) {
			return res.status(403).send('Unauthorized');
		}

		const updatedUser = await User.findOneAndUpdate({ username }, { isAdmin: true }, { new: true });
		if (!updatedUser) {
			return res.status(404).send('User not found');
		}
		res.status(200).json(updatedUser);
	} catch (err) {
		console.error('Error promoting user to admin:', err);
		res.status(500).send(err.message);
	}
});

app.delete('/delete-message/:id', verifyToken, verifyPassword, async (req, res) => {
	try {
		const { id } = req.params;
		const { user } = req.userData;

		if (!user.isAdmin) {
			return res.status(403).send('Unauthorized');
		}

		const deletedMessage = await Message.findByIdAndDelete(id);
		if (!deletedMessage) {
			return res.status(404).send('Message not found');
		}
		io.emit('messageDeleted', deletedMessage); // Emit message deleted event to all connected clients
		res.status(200).send('Message deleted');
	} catch (err) {
		console.error('Error deleting message:', err);
		res.status(500).send(err.message);
	}
});

// Socket.IO connection handling
io.on('connection', (socket) => {
	console.log('User connected to socket');

	socket.on('join', (username) => {
		console.log(`${username} joined the chat`);
	});

	socket.on('disconnect', () => {
		console.log('User disconnected from socket');
	});
});

// Serve index.html for all other routes (single-page application)
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
server.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});
