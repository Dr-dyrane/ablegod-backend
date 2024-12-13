// api/routes/category.js
const express = require("express");
const router = express.Router();
const Category = require("../models/category");

router.get("/", async (req, res) => {
	try {
		const categories = await Category.find();
		res.json(categories);
	} catch (error) {
		res.status(500).json({ error: "Error fetching categories" });
	}
});

router.post("/", async (req, res) => {
	try {
		const newCategory = new Category(req.body);
		const savedCategory = await newCategory.save();
		res.status(201).json(savedCategory);
	} catch (error) {
		res.status(500).json({ error: "Error creating category" });
	}
});

router.delete("/:id", async (req, res) => {
	try {
		await Category.findOneAndDelete({ id: req.params.id });
		res.json({ message: "Category deleted successfully" });
	} catch (error) {
		res.status(500).json({ error: "Error deleting category" });
	}
});
module.exports = router;
