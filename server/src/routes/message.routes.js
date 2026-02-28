import express from 'express';
import { textMessageController,imageMessageController } from '../controllers/message.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { formDataParser } from '../middlewares/multer.middleware.js';

const messageRouter = express.Router();

messageRouter.post('/text', verifyJWT, formDataParser, textMessageController);
messageRouter.post('/image', verifyJWT, formDataParser, imageMessageController);

export default messageRouter;
