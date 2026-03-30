import router from "express";
import {
    createChat,
    getChats,
    getChatById,
    deleteChatById,
    renameChatById
} from "../controllers/chat.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

import { formDataParser } from "../middlewares/multer.middleware.js";

const chatRouter = router.Router();

chatRouter.post("/create", verifyJWT, formDataParser, createChat);
chatRouter.get("/", verifyJWT, getChats);
chatRouter.get("/:id", verifyJWT, getChatById);
chatRouter.delete("/delete/:id", verifyJWT, deleteChatById);
chatRouter.patch("/rename/:id", verifyJWT, formDataParser, renameChatById);
export default chatRouter;