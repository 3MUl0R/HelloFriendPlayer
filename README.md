This is an MRE app written for AltspaceVR. It is an audio player for files stored in your dropbox folder.

# Controls
- basic play/pause/next/volume controls
- spread/rolloff

# Features
- auto advances to the next tack

# How to use
- An instance of this app is running at: ws://167.172.218.76
- Enter this address into an mre sdk app object in your altspace world
- note: you can also visit the web page of the server for detailed instructions http://167.172.218.76
- note: becareful about loading very large audio files. they load into the world and will affect everyone while they load

# How to setup your own instance of this app
- clone the project
- launch your project on a public server such as openode
- install postgresql and create a db to hold playlist info
- after you run the server the first time it will create a default .env file 
- edit your env vars in the .env file and restart your server
- add your .ogg files to a dropbox folder
- create an mre object in your world and enter the address of your server

Enjoy
