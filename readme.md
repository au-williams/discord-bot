# docker-discord-bot

My Discord bot made with [discord.js](https://discord.js.org/) for scalable automation of local and remote tasks. [Docker image](https://github.com/au-williams/docker-discord-bot/pkgs/container/discord-bot) is built with CI using [GitHub Actions](https://github.com/au-williams/docker-discord-bot/actions). 🐋📦

- [Starting the bot](#starting-the-bot)
- [Anatomy of the bot](#anatomy-of-the-bot)
- [Deploying the bot](#deploying-the-bot)

## Starting the bot

🛑 **Required fields in the [config.json](config.json) file must be set before the bot can start!** 🛑

<details>
  <summary>config.json</summary>
  
  | Key                              | Value                                                                                                                     | Required |
  | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
  | `"discord_bot_client_user_id"`   | The Discord bot client ID [(how to find this)](https://support.heateor.com/discord-client-id-discord-client-secret/)      | ✔        |
  | `"discord_bot_login_token"`      | The Discord bot login token [(how to find this)](https://docs.discordbotstudio.org/setting-up-dbs/finding-your-bot-token) | ✔        |
  | `"discord_prefetch_channel_ids"` | The Discord channel IDs to prefetch messages for                                                                          | ✖        |
  | `"discord_config_channel_id"`    | The Discord channel ID where state will be stored                                                                         | ✔        |
  | `"temp_directory"`               | The directory where temporary files will be stored                                                                        | ✔        |
</details>

This project can run from CLI with [Node.js](https://nodejs.org/en) ...

```bash
$ node index.js
```

Or run with [Docker](https://www.docker.com/) using the [Docker image](https://github.com/au-williams/docker-discord-bot/pkgs/container/discord-bot) ...

```url
ghcr.io/au-williams/discord-bot:master
```

⭐ **Docker is recommended so the bot can automatically start and recover from network issues.** ⭐

## Anatomy of the bot

The bot is a framework meant to automate many code-heavy tasks working with the Discord API. You simply need to add a new JavaScript file to the `plugins` folder to add functionality. You must export one or more of these objects in that script ...

<details>
  <summary>export const CronJobs</summary>
  
  ```js
  export const CronJobs = new Set([
    new CronJobScheduler()
      .setFunction(myFunction)
      .setPattern("* * * * *")
  ]);
  ```

  _[Cron](https://en.wikipedia.org/wiki/Cron#CRON_expression) is a job scheduler that runs functions on an [expression](https://devhints.io/cron), like every 5 minutes or every Saturday at 9 AM. The bot framework automatically schedules the Cron jobs you create here. You can customize your Cron job with the following setters ..._

  | Setters      | Required | Purpose                                                              |
  | ------------ | -------- | -------------------------------------------------------------------- |
  | setEnabled   | `false`  | Sets the enabled state of the Cron job (typically for debugging).    |
  | setFunction  | `true`   | Sets the function to execute when the Cron job is running.           |
  | setPattern   | `true`   | Sets the Cron expression used when scheduling the Cron job.          |
  | setRunOrder  | `false`  | Sets the order this Cron job runs with others to avoid race issues.  |
  | setTriggered | `false`  | Sets if the Cron job should run on startup and before its pattern. |
</details>

<details>
  <summary>export const Interactions</summary>

  ```js
  export const Interactions = Object.freeze({
    ButtonComponentWave: "PLUGIN_BUTTON_COMPONENT_WAVE"
  });
  ```

  _Every action in Discord can be thought of as an interaction. Clicking buttons, submitting forms, sending messages, etc. When we create buttons to click or forms to submit we must assign them a unique ID that Discord will emit back to us when it has been interacted with. These unique IDs are set on components and used as keys in `Listeners<object>`._
</details>

<details>
  <summary>export const Listeners</summary>

  ---

  Listeners are used to handle actions. The key is a Discord event or an interaction from the `Interactions<object>` variable. The value is a `Listener` object that will be executed when the key is emitted by Discord.

  ```js
  export const Listeners = Object.freeze({
    [Interactions.ButtonComponentWave]: new Listener()
      .setDescription("Sends the wave emoji when the button is clicked.")
      .setFunction(onButtonComponentWave)
  });
  ```

  Listeners that only set a function can use the function as the value and it will be wrapped in a Listener by the framework automatically. You can use an array to define multiple Listeners for a single key. There are many setters you can use which were made to reduce the amount of code needed to write complex functionality:

  | Setters                | Required | Purpose                                                             |
  | ---------------------- | -------- | ------------------------------------------------------------------- |
  | setBusyFunction        | `false`  | Sets the function to execute when the listener is flagged as busy.  |
  | setDeploymentType      | `false`  | Sets the type of POST request to use when deploying to Discord.     |
  | setDescription         | `false`  | Sets the text displayed when describing functionality to the user.  |
  | setEnabled             | `false`  | Sets the enabled state of the listener (typically for debugging).   |
  | setFunction            | `true`   | Sets the function to execute when the listener is authorized.       |
  | setLockedUserFunction  | `false`  | Sets the function to execute when the listener is not authorized.   |
  | setRequiredChannels    | `false`  | Sets the channel ID(s) required for the listener to be executed.    |
  | setRequiredChannelType | `false`  | Sets the channel type required for the listener to be executed.     |
  | setRequiredRoles       | `false`  | Sets the role ID(s) a user must possess one of to be authorized.    |
  | setRunOrder            | `false`  | Sets the order this listener runs with others to avoid race issues. |

  ---
</details>

These are the JavaScript files currently in the `plugins` folder ...

<details>
  <summary>plugins/cat_facts_scheduler.js</summary>
</details>

<details>
  <summary>plugins/caturday_scheduler.js</summary>
</details>

<details>
  <summary>plugins/deep_rock_galactic_announcer.js</summary>
</details>

<details>
  <summary>plugins/discord_direct_message_manager.js</summary>
</details>

<details>
  <summary>plugins/discord_guild_role_color_manager.js</summary>
</details>

<details>
  <summary>plugins/plex_music_downloader.js</summary>
</details>

<details>
  <summary>plugins/steam_community_announcer.js</summary>
</details>

JavaScript files in the `services` folder operate the same as plugins but are dependencies for the bot framework. Thus when handling errors, plugins will catch and release while services throw to avoid an invalid system state. You can use these services in your plugin by referencing them.

<details>
  <summary>services/config.js</summary>
</details>

<details>
  <summary>services/emitter.js</summary>
</details>

<details>
  <summary>services/logger.js</summary>
</details>

<details>
  <summary>services/messages.js</summary>
</details>

## Deploying the bot

<!-- ## Creating plugins

The `index.js` file handles [discord.js events](https://old.discordjs.dev/#/docs/discord.js/14.9.0/typedef/Events) and invokes the corresponding function names in `./plugins/` JavaScript files. Simply creating a new JavaScript file with an appropriately named function is enough for it to execute - but you **_should_** add the config and readme files for optimal code quality.

```
./plugins/
↳ example_plugin_config.json
↳ example_plugin_readme.md
↳ example_plugin_script.js
```

### Querying message history

The `index.js` file maintains the message history of guild channels to reduce the overall number of API requests sent to Discord. A channels message history is lazy-loaded on the first invocation and automatically kept up-to-date after.

```js
import { getChannelMessages } from "../index.js";

const predicate = ({ author, content }) => author === "foo" || content === "bar";
const messages = getChannelMessages("YOUR_DISCORD_CHANNEL_ID").filter(predicate);
```

_**Note:** You can load channels on startup with the `"discord_prefetch_channel_ids"` config value! This is useful when there's noticeable delay lazy-loading a channel with a large number of messages._

### Registering slash commands

You can register slash commands for a plugin by exporting the `PLUGIN_COMMANDS` array.

```js
// define "/hello-world" slash command
export const PLUGIN_COMMANDS = [
  {
    name: "hello-world",
    description: `Prints "Hello World" to the console`,
    onInteractionCreate: () => console.log("Hello World!")
  }
];
```

**You must start the bot with the `deploy` arg for any slash command changes to take effect:**

```bash
$ node index.js deploy
```

This sends a PUT request to Discord containing the updated slash commands during startup.

## Configuration [(config.json)](config.json)

| Key                              | Value                                                                                                                     | Required |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| `"discord_bot_client_user_id"`   | The Discord bot client ID [(how to find this)](https://support.heateor.com/discord-client-id-discord-client-secret/)      | ✔        |
| `"discord_bot_login_token"`      | The Discord bot login token [(how to find this)](https://docs.discordbotstudio.org/setting-up-dbs/finding-your-bot-token) | ✔        |
| `"discord_prefetch_channel_ids"` | The Discord channel IDs to prefetch messages for                                                                          | ✖        |
| `"discord_config_channel_id"`    | The Discord channel ID where state will be stored                                                                         | ✔        |
| `"temp_directory"`               | The directory where temporary files will be stored                                                                        | ✔        | -->

<!--
TODO:
# managing state
# managing logs
# add config value ... discord_logs_channel_id
-->
