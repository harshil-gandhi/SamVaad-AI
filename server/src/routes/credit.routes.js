import express from "express";
import { getAllPlans, purchasePlan, verifyPaymentSession } from "../controllers/credit.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { formDataParser } from "../middlewares/multer.middleware.js";
const creditRouter = express.Router();

creditRouter.get("/plans", getAllPlans);
creditRouter.post("/purchase", formDataParser, verifyJWT, purchasePlan);    
creditRouter.get("/verify-session", verifyJWT, verifyPaymentSession);

export default creditRouter;