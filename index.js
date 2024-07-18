const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const bcryct = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors({
    origin: [
        'http://localhost:5173',
    ],
    credentials: true
}));

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.USER_PASS}@cluster0.y7qmkns.mongodb.net/?retryWrites=true&w=majority&appName=cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const usersCollection = client.db('mfs').collection('users');

        app.get('/users', async (req, res) => {
            const search = req.query.search;
            const status = req.query.filter;
            const size = parseInt(req.query.size);
            const page = parseInt(req.query.page);
            let query = {}
            if (search) {
                query.$or = [
                    { mobileNumber: new RegExp(search, 'i') },
                    { email: new RegExp(search, 'i') }
                ]
            }
            if (status) {
                query.status = status
            }
            const skip = (page - 1) * size
            const result = await usersCollection.find(query).skip(skip).limit(size).toArray();
            res.send(result);
        })

        // only totalCount
        app.get('/users-total', async (req, res) => {
            const search = req.query?.search;
            const status = req.query?.filter;
            let query = {};
            if (search) {
                query.$or = [
                    { name: new RegExp(search, 'i') },
                    { email: new RegExp(search, 'i') }
                ]
            }
            if (status) {
                query.status = status
            }
            const result = await usersCollection.countDocuments(query);
            res.send({ count: result });
        })

        app.get('/user/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.findOne(query);
            res.send(result);
        })
        // register a user
        app.post('/register', async (req, res) => {
            const { name, mobileNumber, email, pin, role } = req.body;
            const hashedPin = await bcryct.hash(pin, 10);
            const user = {
                name,
                pin: hashedPin,
                mobileNumber,
                email,
                status: 'pending',
                role,
                balance: 0,
                bonus: false
            }
            const exist = await usersCollection.findOne({ $or: [{ mobileNumber: mobileNumber }, { email: email }] });
            if (exist) return res.send({ message: 'Already as a Account' })
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })
        // login a user
        app.post('/login', async (req, res) => {
            const { identifier, pin } = req.body;
            const user = await usersCollection.findOne({ $or: [{ mobileNumber: identifier }, { email: identifier }] });
            if (user && await bcryct.compare(pin, user.pin)) {
                const token = jwt.sign(user, process.env.ACCESS_TOKEN_KEY, { expiresIn: '1d' });
                res.cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
                }).send({ id: user._id })
            } else {
                res.status(400).json({ message: 'Invalid credentials' });
            }
        })
        // jwt token clear cookie
        app.post('/logout', async (req, res) => {
            const user = req.body;
            res.clearCookie('token', { maxAge: 0 }).send({ success: true })
        })

        // Manage Users update role
        app.patch('/user/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const query = { _id: new ObjectId(id) };
            const user = await usersCollection.findOne(query);
            let balance = user.balance
            if (user?.bonus === false && user.role === 'User') {
                balance = 40
            }
            if (user?.bonus === false && user.role === 'Agent') {
                balance = 10000
            }
            const updateDoc = {
                $set: {
                    ...data,
                    balance: balance,
                    bonus: true
                }
            }
            const result = await usersCollection.updateOne(query, updateDoc);
            res.send(result)
        })

        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('MFS server is running..!')
})

app.listen(port, () => {
    console.log(`MFS server is runnung port on : ${port}`)
})