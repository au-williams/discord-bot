# Deep Rock Galactic Watcher

![Image preview](../assets/documentation/deep_rock_galactic_watcher.png)

Get weekly assignment updates for [Deep Rock Galactic](https://store.steampowered.com/app/548430/Deep_Rock_Galactic/). ***Rock and Stone!*** 🍺

## Script — [deep_rock_galactic_watcher_script.js](deep_rock_galactic_watcher_script.js)

This script runs every waking hour and fetches the [DRG API](https://drgapi.com/) to send any assignment changes to each Discord channel.

## Config — [deep_rock_galactic_watcher_config.json](deep_rock_galactic_watcher_config.json)

| Key             | Value                                                |
| --------------- | ---------------------------------------------------- |
| `"channel_ids"` | The Discord channel IDs that this module will run in |