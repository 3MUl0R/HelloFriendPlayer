This is an MRE app written for AltspaceVR. 
It is an audio player for your personal files stored in your dropbox folder.

Music played with this player will be synchronized between all users.

# Features
- basic play/pause/next/volume controls
- shuffle
- auto track advance
- spread/rolloff control
- moderator only controls
- wrist based remote control for moderators
- saved state between sessions and worlds
- auto plays on entry if thats the way you left it

# How to use - the easy way
- An instance of this app is running at: ws://167.172.218.76
- Enter this address into an mre sdk app object in your altspace world
- - you can find the mre in the basic folder of world editor
- paste the link to your shared dropbox folder into the prompt and enjoy

- - note: you can also visit the web page of the server for instructions with pictures http://167.172.218.76
- - note: be careful about loading very large audio files. they load into the world and will affect everyone while they load
- - note: the session id in the mre can be used in multiple spaces to get the same playlist



# Want to setup your own instance of this app?
- fyi it is not necessary to do this. if you just want to play music use the easy instructions above
- clone the project
- launch your project on a public server such as openode
- install postgresql and create a db to hold playlist info
- after you run the server the first time it will create a default .env file 
- edit your env vars in the .env file and restart your server
- add your .ogg files to a dropbox folder
- create an mre object in your world and enter the address of your server

Enjoy
