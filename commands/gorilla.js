import { SlashCommandBuilder } from 'discord.js'

export default {
	data: new SlashCommandBuilder()
		.setName('gorilla')
		.setDescription('Go. Ril. La.'),
	async execute(interaction) {
		await interaction.reply(':gorilla: :gorilla: :gorilla:');
	},
};