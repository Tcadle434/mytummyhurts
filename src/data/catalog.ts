import { DishBlueprint, TopUpOption } from "../types/domain";

export const conditionOptions = [
	"IBS",
	"IBD",
	"GERD / Acid reflux",
	"Lactose intolerance",
	"Gluten sensitivity",
	"Leaky gut",
	"Unsure, just general discomfort",
];

export const ingredientSensitivityOptions = [
	"Dairy",
	"Gluten",
	"Garlic",
	"Onion",
	"Tomato",
	"Spicy foods",
];

export const symptomOptions = [
	"Reflux / Heartburn",
	"Bloating",
	"Nausea",
	"Diarrhea",
	"Constipation",
	"Gas",
];

export const symptomFrequencyOptions = [
	"Rarely",
	"A few times a month",
	"A few times a week",
	"Almost daily",
	"Frequently throughout the day",
];

export const symptomSeverityOptions = ["Mild", "Moderate", "Severe", "It varies a lot"];

export const mealContextOptions = [
	"Restaurants",
	"Takeout",
	"Grocery or packaged foods",
	"Home-cooked meals",
	"Snacks on the go",
];

export const currentEatingPatternOptions = [
	"Trying to eat clean",
	"Mostly convenience meals",
	"Often eating out",
	"Avoiding known triggers",
	"Still eating problem foods",
	"Recently had a flare-up",
];

export const lifestyleFactorOptions = [
	"High stress",
	"Poor sleep",
	"Traveling often",
	"Irregular meal times",
	"Alcohol sometimes",
	"Caffeine daily",
];

export const triedGutHealthAppsOptions = ["Yes", "No"];

export const motivationOptions = [
	"Avoid flare-ups",
	"Figure out triggers",
	"Find safe foods",
	"Reset my gut",
	"Feel consitently healthier",
];

export const topUpOptions: TopUpOption[] = [
	{ id: "topup-25", label: "25 extra scans", tokens: 25, price: "$7.99" },
	{ id: "topup-60", label: "60 extra scans", tokens: 60, price: "$14.99" },
];

export const dishLibrary: DishBlueprint[] = [
	{
		dishName: "Spaghetti Marinara",
		ingredients: ["pasta", "tomato", "garlic", "olive oil", "parmesan"],
		prepStyle: ["boiled", "simmered"],
		notes: ["restaurant dish", "ingredient uncertainty possible"],
	},
	{
		dishName: "Chicken Rice Bowl",
		ingredients: ["chicken", "rice", "avocado", "pickled onion", "hot sauce"],
		prepStyle: ["grilled", "assembled"],
		notes: ["balanced meal", "sauce may increase uncertainty"],
	},
	{
		dishName: "Cheeseburger and Fries",
		ingredients: ["beef", "bun", "cheese", "onion", "fries"],
		prepStyle: ["grilled", "fried"],
		notes: ["higher fat meal", "fried side included"],
	},
	{
		dishName: "Greek Yogurt Berry Bowl",
		ingredients: ["yogurt", "berries", "granola", "honey"],
		prepStyle: ["cold", "assembled"],
		notes: ["dairy-heavy breakfast bowl"],
	},
	{
		dishName: "Salmon Rice Plate",
		ingredients: ["salmon", "rice", "cucumber", "sesame", "soy sauce"],
		prepStyle: ["seared", "assembled"],
		notes: ["lean protein", "condiments may vary"],
	},
	{
		dishName: "Vegetable Stir Fry",
		ingredients: ["broccoli", "garlic", "onion", "soy sauce", "rice noodles"],
		prepStyle: ["sauteed", "sauced"],
		notes: ["garlic and onion are common digestive triggers"],
	},
];
