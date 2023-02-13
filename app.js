import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import {
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	StreamType,
	AudioPlayerStatus,
	VoiceConnectionStatus,
} from '@discordjs/voice';
import fs from 'node:fs';
import path from 'node:path';
import * as url from 'url';
import createDiscordJSAdapter from './adapter.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = await import(filePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command.default && 'execute' in command.default) {
		client.commands.set(command.default.data.name, command.default);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
	try {
		await playSong();
		console.log('Apes ready to rejoice!');
	} catch (error) {
		console.error(error);
	}
})

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
});

const player = createAudioPlayer();

player.on('error', err => {
	console.error('Error: ',err.message, 'with track', err.resource.metadata.title);
})

function playSong() {
	const resource = createAudioResource(path.join(__dirname, 'assets/audio/monkey.mp3'), {
		inputType: StreamType.Arbitrary,
	});

	/**
	 * We will now play this to the audio player. By default, the audio player will not play until
	 * at least one voice connection is subscribed to it, so it is fine to attach our resource to the
	 * audio player this early.
	 */
	player.play(resource);

	/**
	 * Here we are using a helper function. It will resolve if the player enters the Playing
	 * state within 5 seconds, otherwise it will reject with an error.
	 */
	return entersState(player, AudioPlayerStatus.Playing, 5000);
}

async function connectToChannel(channel) {
	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId: channel.guild.id,
		adapterCreator: createDiscordJSAdapter(channel),
	});

	try {
		/**
		 * Allow ourselves 30 seconds to join the voice channel. If we do not join within then,
		 * an error is thrown.
		 */
		await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
		/**
		 * At this point, the voice connection is ready within 30 seconds! This means we can
		 * start playing audio in the voice channel. We return the connection so it can be
		 * used by the caller.
		 */
		return connection;
	} catch (error) {
		/**
		 * At this point, the voice connection has not entered the Ready state. We should make
		 * sure to destroy it, and propagate the error by throwing it, so that the calling function
		 * is aware that we failed to connect to the channel.
		 */
		connection.destroy();
		throw error;
	}
}

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
	if (oldState.member.user.bot) return;
	if (oldState.channelId === null || typeof oldState.channelId == 'undefined') {
		const channel = newState.member?.voice.channel;

		if (channel) {
			try {
				const connection = await connectToChannel(channel);
				const subscription = connection.subscribe(player);
				
				if (subscription) {
					setTimeout(() => {
						subscription.unsubscribe();
						connection.destroy();
					}, 5_000);
				}
			} catch (err) {
				console.error(err)
			}
		} else {
			console.log('no voice channel detected');
		}
	}
});

client.on(Events.MessageCreate, async (message) => {
	if (!message.guildId) return;

	if (message.content === '-rejoice') {
		const channel = message.member?.voice.channel;

		if (channel) {
			/**
			 * The user is in a voice channel, try to connect.
			 */
			try {
				const connection = await connectToChannel(channel);

				/**
				 * We have successfully connected! Now we can subscribe our connection to
				 * the player. This means that the player will play audio in the user's
				 * voice channel.
				 */
				const subscription = connection.subscribe(player);
				await message.reply(':gorilla: :gorilla: :gorilla:');
				if (subscription) {
					setTimeout(() => {
						subscription.unsubscribe();
						connection.destroy();
					}, 5_000);
				}

			} catch (error) {
				/**
				 * Unable to connect to the voice channel within 30 seconds :(
				 */
				console.error(error);
			}
		} else {
			/**
			 * The user is not in a voice channel.
			 */
			void message.reply('Join a voice channel then try again!');
		}
	}
});

client.login(process.env.DISCORD_TOKEN);