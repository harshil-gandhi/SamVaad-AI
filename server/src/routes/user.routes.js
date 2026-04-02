import { Router } from "express";
import {
    deletePublishedImage,
    getCurrentUser,
    getPublishedImages,
    loginUser,
    logoutUser,
    refreshAccessToken,
    registerUser
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { formDataParser } from "../middlewares/multer.middleware.js";

const router = Router();

router.post("/register", formDataParser, registerUser);
router.post("/login", formDataParser, loginUser);
router.post("/refresh-token", refreshAccessToken);

router.get("/me", verifyJWT, getCurrentUser);
router.post("/logout", verifyJWT, logoutUser);
router.get("/published-images", verifyJWT, getPublishedImages);
router.delete("/published-images/:messageId", verifyJWT, deletePublishedImage);

export default router;
