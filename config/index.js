require('dotenv').config()

let settings = {
    DB_USER: "server",
    DB_PASSWORD: "",
    DB_NAME: "",
    SUBMISSION_BUCKET: 'student-submissions.thesophon.com', // handles submissions by students
    UPLOAD_BUCKET: 'uploads.thesophon.com', // handles questions from teachers
}

if (process.env.DEPLOYMENT === 'production') {
    settings.DB_CONNECTION_STRING = ``;
    settings.INSTANCE_SERVER_URL = 'http://students.thesophon.com';
}
else if (process.env.DEPLOYMENT === 'local') {
    settings.DB_CONNECTION_STRING = `mongodb://localhost:27017`;
    settings.INSTANCE_SERVER_URL = 'http://localhost:3001'
}
else {
    settings.DB_CONNECTION_STRING = ``;
    settings.INSTANCE_SERVER_URL = 'http://localhost:3001'
}

exports.settings = settings;
