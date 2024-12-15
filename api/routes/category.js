// api/routes/category.js
const express = require("express");
const router = express.Router();
const Category = require("../models/category");

router.get("/", async (req, res) => {
	try {
		const categories = await Category.find();
		res.json(categories);
	} catch (error) {
		console.error("Error fetching categories:", error);
		res.status(500).json({ error: "Error fetching categories" });
	}
});

router.post("/", async (req, res) => {
	try {
		const newCategory = new Category(req.body);
		const savedCategory = await newCategory.save();
		res.status(201).json(savedCategory);
	} catch (error) {
		console.error("Error creating category:", error);
		res.status(500).json({ error: "Error creating category" });
	}
});

router.put("/:id", async (req, res) => {
	try {
		const category = await Category.findOne({ id: req.params.id });
		if (!category) {
			return res.status(404).json({ error: "Category not found" });
		}

		const updatedCategory = await Category.findByIdAndUpdate(
			category._id,
			{ ...req.body },
			{ new: true }
		);
		res.json(updatedCategory);
	} catch (error) {
		console.error("Error updating category:", error);
		res.status(500).json({ error: "Error updating category" });
	}
});

router.delete("/:id", async (req, res) => {
	try {
		const category = await Category.findOne({ id: req.params.id });
		if (!category) {
			return res.status(404).json({ error: "Category not found" });
		}

		await Category.findByIdAndDelete(category._id);
		res.json({ message: "Category deleted successfully" });
	} catch (error) {
		console.error("Error deleting category:", error);
		res.status(500).json({ error: "Error deleting category" });
	}
});
module.exports = router;
