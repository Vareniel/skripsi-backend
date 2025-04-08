const socket = io('http://localhost:3000'); // Sesuaikan dengan URL server Anda

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('status', (data) => {
    // console.log('Status:', data);
    document.getElementById('loading-message').innerText = data.message;
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});