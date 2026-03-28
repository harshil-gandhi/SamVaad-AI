import express from 'express';
import { textMessageController,imageMessageController, websiteMessageController, uploadQaMessageController } from '../controllers/message.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { uploadSingleMedia } from '../middlewares/multer.middleware.js';

const messageRouter = express.Router();

messageRouter.post('/text', verifyJWT, textMessageController);
messageRouter.post('/image', verifyJWT, imageMessageController);
messageRouter.post('/website', verifyJWT, websiteMessageController);
messageRouter.post('/upload-qa', verifyJWT, uploadSingleMedia, uploadQaMessageController);

export default messageRouter;
