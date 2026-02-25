export const generateUniqueCode = (length: number = 6): string => {
	const characters = "ABCDEFGHIJKMNPQRSTUVWXYZ23456789";
	let result = "";
	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * characters.length);
		result += characters[randomIndex];
	}
	return result;
};
