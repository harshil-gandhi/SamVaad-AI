import express from "express";
import { getAllPlans, purchasePlan } from "../controllers/credit.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { formDataParser } from "../middlewares/multer.middleware.js";
const creditRouter = express.Router();

creditRouter.get("/plans", getAllPlans);
creditRouter.post("/purchase", formDataParser, verifyJWT, purchasePlan);    

export default creditRouter;