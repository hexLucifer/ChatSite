const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const chatContainer = document.querySelector('.chat-container');
const loginContainer = document.querySelector('.login-container');
const messageBox = document.getElementById('messageBox');
const usernameInput = document.getElementById('usernameInput');
const themeToggle = document.getElementById('themeToggle');
const sendButton = document.getElementById('sendButton');
const logoutButton = document.getElementById('logoutButton');
const registerButton = document.getElementById('registerButton');
const adminPanel = document.getElementById('adminPanel');
const userList = document.getElementById('userList');
const body = document.body;

let currentUser = null;
let socket;

document.addEventListener('DOMContentLoaded', () => {
	const savedTheme = localStorage.getItem('theme') || 'light';
	if (savedTheme === 'dark') {
		body.classList.add('dark-theme');
		themeToggle.checked = true;
	} else {
		body.classList.add('light-theme');
	}

	// Check if user is already logged in
	const loggedInUser = localStorage.getItem('currentUser');
	if (loggedInUser) {
		currentUser = JSON.parse(loggedInUser);
		showChatInterface();
		getMessages();
		initializeSocket();
	} else {
		showLoginInterface();
	}
});

themeToggle.addEventListener('change', function() {
	if (this.checked) {
		body.classList.remove('light-theme');
		body.classList.add('dark-theme');
		localStorage.setItem('theme', 'dark');
	} else {
		body.classList.remove('dark-theme');
		body.classList.add('light-theme');
		localStorage.setItem('theme', 'light');
	}
});

loginForm.addEventListener('submit', async function(event) {
	event.preventDefault();
	const username = loginUsername.value.trim();
	const password = loginPassword.value.trim();

	try {
		const response = await fetch('/login', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				username,
				password
			}),
		});

		if (response.ok) {
			const contentType = response.headers.get("content-type");
			if (contentType && contentType.includes("application/json")) {
				const userData = await response.json();
				currentUser = {
					username: userData.username,
					token: userData.token, // Store token here
					isAdmin: userData.isAdmin,
				};
				localStorage.setItem('currentUser', JSON.stringify(currentUser));

				// Update username input field
				usernameInput.value = currentUser.username;

				// Show chat interface, get messages, and initialize socket
				showChatInterface();
				getMessages();
				initializeSocket();

				// Show/hide admin panel based on isAdmin status
				if (currentUser.isAdmin) {
					showAdminPanel();
					// Display user list if the currentUser is admin
					displayUserList();
				} else {
					hideAdminPanel();
				}
			} else {
				alert('Invalid response type. Please try again.');
			}
		} else {
			alert('Invalid username or password. Please try again.');
		}
	} catch (error) {
		console.error('Error logging in:', error);
		alert('An error occurred while logging in. Please try again later.');
	}

	loginUsername.value = '';
	loginPassword.value = '';
});

// Display user list in the admin panel
function displayUserList() {
	fetch('/users', {
		headers: {
			'Authorization': `Bearer ${currentUser.token}` // Include token in the request
		}
	})
	.then(response => {
		if (!response.ok) {
			throw new Error('Failed to retrieve user list');
		}
		return response.json();
	})
	.then(users => {
		userList.innerHTML = ''; // Clear previous user list
		users.forEach(user => {
			const li = document.createElement('li');
			li.textContent = `${user.username} ${user.isAdmin ? '(Admin)' : ''}`;
			userList.appendChild(li);
		});
	})
	.catch(error => {
		console.error('Error getting user list:', error);
		alert('Failed to retrieve user list. Please refresh the page.');
	});
}

function showAdminPanel() {
	adminPanel.style.display = 'block';
}

function hideAdminPanel() {
	adminPanel.style.display = 'none';
}

function getCurrentUser() {
	const userData = JSON.parse(localStorage.getItem('currentUser'));
	if (userData) {
		currentUser = {
			username: userData.username,
			token: userData.token,
			isAdmin: userData.isAdmin,
		};
		usernameInput.value = currentUser.username;
	} else {
		currentUser = null;
	}
}

registerButton.addEventListener('click', async () => {
	const username = loginUsername.value.trim();
	const password = loginPassword.value.trim();

	try {
		const response = await fetch('/register', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				username,
				password
			}),
		});

		if (response.ok) {
			alert('User registered successfully.');
		} else {
			alert('Failed to register user. Please try again.');
		}
	} catch (error) {
		console.error('Error registering user:', error);
		alert('An error occurred while registering. Please try again later.');
	}
});

logoutButton.addEventListener('click', () => {
	currentUser = null;
	localStorage.removeItem('currentUser');
	hideChatInterface();
	showLoginInterface();
	messageBox.innerHTML = ''; // Clear the chat messages
	usernameInput.value = ''; // Clear the username input field
	socket.disconnect(); // Disconnect socket on logout
});

document.addEventListener('DOMContentLoaded', () => {
	getCurrentUser();
	// usernameInput.value = currentUser;
	usernameInput.setAttribute('readonly', true);
});

sendButton.addEventListener('click', sendMessage);

document.addEventListener('DOMContentLoaded', () => {
	// Add event listener for Enter key press
	const chatInput = document.getElementById('chatInput');
	chatInput.addEventListener('keypress', function(event) {
		if (event.keyCode === 13) {
			event.preventDefault();
			sendMessage(); // Call sendMessage function
		}
	});
});

async function sendMessage() {
	const chatInput = document.getElementById('chatInput');
	const message = chatInput.value.trim();
	const userData = JSON.parse(localStorage.getItem('currentUser'));
	const token = userData.token;
	const username = userData.username;
	chatInput.value = '';

	try {
		await fetch('/send-message', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${token}` // Use bearer token here
			},
			body: JSON.stringify({
				username,
				message
			}),
		});
	} catch (error) {
		console.error('Error sending message:', error);
		alert('Failed to send message. Please try again.');
	}
}

async function getMessages() {
	try {
		const response = await fetch('/get-messages', {
			headers: {
				'Authorization': `Bearer ${currentUser.token}` // Include token in the request
			}
		});
		if (!response.ok) {
			throw new Error('Failed to retrieve messages');
		}
		const messages = await response.json();

		if (messages.length === 0) {
			console.log('No messages found in the database');
			return; // Exit function early if no messages
		}

		console.log('Received messages:', messages);
		displayMessages(messages);
	} catch (error) {
		console.error('Error getting messages:', error);
		alert('Failed to retrieve messages. Please refresh the page.');
	}
}

document.addEventListener('DOMContentLoaded', () => {
	if (currentUser && currentUser.isAdmin) {
		showAdminPanel();
		displayUserList();
	}
});

function displayMessages(messages) {
	const messageBox = document.getElementById('messageBox');
	messageBox.innerHTML = '';

	messages.forEach(message => {
		displayNewMessage(message);
	});

	messageBox.scrollTop = messageBox.scrollHeight;
}

function isAdmin() {
	return currentUser && currentUser.isAdmin;
}

// Display admin panel and user list if the current user is an admin
async function checkAdminStatus() {
	try {
		const response = await fetch('/users', {
			headers: {
				'Authorization': `Bearer ${currentUser.token}` // Include token in the request
			}
		});
		if (!response.ok) {
			throw new Error('Failed to retrieve user list');
		}
		const users = await response.json();

		adminPanel.style.display = isAdmin() ? 'block' : 'none';
		displayUserList(users);
	} catch (error) {
		console.error('Error getting user list:', error);
		alert('Failed to retrieve user list. Please refresh the page.');
	}
}

async function promoteToAdmin(username) {
	const password = prompt('Enter your password to promote this user to admin:');
	if (!password) return;

	try {
		const response = await fetch('/promote-to-admin', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${currentUser.token}` // Include token in the request
			},
			body: JSON.stringify({
				username,
				password
			}),
		});

		if (response.ok) {
			const updatedUser = await response.json();
			alert(`${updatedUser.username} has been promoted to admin`);
			checkAdminStatus(); // Refresh admin panel and user list
		} else if (response.status === 403) {
			alert('You are not authorized to perform this action.');
		} else {
			throw new Error('Failed to promote user to admin');
		}
	} catch (error) {
		console.error('Error promoting user to admin:', error);
		alert('Failed to promote user to admin. Please try again.');
	}
}

// Event listener for promoting a user to admin
userList.addEventListener('click', function(event) {
	const target = event.target;
	if (target.tagName === 'LI') {
		const username = target.textContent.split(' ')[0]; // Extract username
		promoteToAdmin(username);
	}
});

// Example: Display admin panel and user list on page load (if the admin panel is visible)
document.addEventListener('DOMContentLoaded', async () => {
	// Check if the current user is an admin and display the admin panel accordingly
	await checkAdminStatus();
});

function showChatInterface() {
	loginContainer.style.display = 'none';
	chatContainer.style.display = 'flex';
}

function showLoginInterface() {
	loginContainer.style.display = 'flex';
	chatContainer.style.display = 'none';
}

function hideChatInterface() {
	chatContainer.style.display = 'none';
}

function initializeSocket() {
	socket = io(); // Initialize socket.io
	socket.on('connect', () => {
		console.log('Connected to socket');
		socket.emit('join', currentUser); // Join socket room with current user
	});

	socket.on('message', message => {
		console.log('New message received:', message);
		displayNewMessage(message);
	});

	socket.on('disconnect', () => {
		console.log('Disconnected from socket');
	});
}

function displayNewMessage(message) {
	const messageBox = document.getElementById('messageBox');
	const messageElement = document.createElement('div');
	messageElement.classList.add('message');

	const usernameSpan = document.createElement('span');
	usernameSpan.textContent = `${message.username}: ${message.message}`;

	messageElement.appendChild(usernameSpan);

	if (isAdmin()) {
		const deleteButton = document.createElement('button');
		deleteButton.textContent = 'Delete';
		deleteButton.classList.add('delete-button');
		deleteButton.dataset.messageId = message._id;

		deleteButton.addEventListener('click', async () => {
			const password = prompt('Enter your password to delete this message:');
			if (!password) return;

			const messageId = deleteButton.getAttribute('data-message-id');
			try {
				const response = await fetch(`/delete-message/${messageId}`, {
					method: 'DELETE',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${currentUser.token}` // Include token in the request
					},
					body: JSON.stringify({
						username: currentUser.username,
						password
					}),
				});

				if (response.ok) {
					alert('Message deleted successfully');
					messageElement.remove(); // Remove the message from DOM
				} else if (response.status === 403) {
					alert('You are not authorized to perform this action.');
				} else {
					throw new Error('Failed to delete message');
				}
			} catch (error) {
				console.error('Error deleting message:', error);
				alert('Failed to delete message. Please try again.');
			}
		});

		messageElement.appendChild(deleteButton);
	}

	messageBox.appendChild(messageElement);
	messageBox.scrollTop = messageBox.scrollHeight;
}
