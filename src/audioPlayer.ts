/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk'
import Prompt from './prompt'
import AudioFileInfo, { ButtonStorage, SessionData, SessionState } from './types'


/** Defines an animation control field */
interface ControlDefinition {
	/** Decorative label for the control */
	label: string
	/** Changes a property, and returns a result string */
	action: (incr: number) => string
	/** Whether the control should be updated on a timer */
	realtime?: boolean
	/** The actor who's text needs to be updated */
	labelActor?: MRE.Actor
}


export default class AudioFilePlayer{

	protected modsOnly = true
	private assets: MRE.AssetContainer
	private musicAssetContainer: MRE.AssetContainer
	private settingsHaveChangedSinceSave = false
	private autoAdvanceIntervalSeconds = 1
	private settingsSaveIntervalSeconds = 10
	private musicIsPlaying = false
	private elapsedPlaySeconds = 0
	private currentsongIndex = 0
	private musicSpeaker : MRE.Actor
	private musicSoundInstance : MRE.MediaInstance
	private currentMusicAsset : MRE.Sound
	private volume = 0.04
	private spread = 0.4
	private rolloffStartDistance = 2.5
	private playStateLabel : MRE.Actor
	private playPauseButton : MRE.Actor
	private wristPlayPauseButtonStorageList : ButtonStorage[] = []
	private trackNameLabel : MRE.Actor
	private volumeLabel : MRE.Actor
	private arrowMesh : MRE.Mesh
	private squareMesh : MRE.Mesh
	private stopButtonMaterial : MRE.Material
	private playButtonMaterial : MRE.Material
	private generalButtonMaterial : MRE.Material
	private volumeButtonMaterial : MRE.Material
	private skipButtonMaterial : MRE.Material
	private wristControlsRootPose = {pos:{x:0, y:0, z:0.04}, ori:{x:2.325398, y:1.570796, z:0}}
	private wristControlsScale = 0.2

	//if streaming is used on files then the audio is not syncd between users
	private useStreaming = false

	controls: ControlDefinition[] = []
	prompt : Prompt



    /**
     * creates an instance of the player
     * @param context 
	 * @param socket
	 * @param musicFileList
     */
	constructor(
			private context: MRE.Context, 
			private socket: SocketIOClient.Socket, 
			private musicFileList: AudioFileInfo[] = []
		){

    }

	/**
	 * unload all asset containers
	 */
	public cleanup() {
		this.assets.unload()
		this.musicAssetContainer.unload()
	}

    /**
     * Create the player and controls in world
     * @param rootActor 
     */
	public async run(rootActor: MRE.Actor): Promise<boolean> {

		this.prompt = new Prompt(this.context)
		this.assets = new MRE.AssetContainer(this.context)
		this.musicAssetContainer = new MRE.AssetContainer(this.context)

		this.musicSpeaker = MRE.Actor.Create(this.context, {
			actor: {
				name: `TheSoundSpeaker`,
				parentId: rootActor.id,
			}
		})

		//get a playlist for this session if one exists
		this.socket.emit("getSessionPlaylist", this.context.sessionId)
		//when the session data is returned put it to use
		this.socket.on("deliverSessionState", (sessionData:SessionData) => {
			this.musicFileList = sessionData.playlist
			this.volume = sessionData.state.volume
			this.spread = sessionData.state.spread
			this.rolloffStartDistance = sessionData.state.rolloffStartDistance
			this.currentsongIndex = sessionData.state.currentsongIndex
			this.musicIsPlaying = sessionData.state.musicIsPlaying
			console.log(`received session data for session: ${this.context.sessionId}: `, sessionData)

			//load the first sound into the object
			this.loadNextTrack()
		})

		//default to paused
        if (this.musicSoundInstance) this.musicSoundInstance.pause()
		
		//watch for the track duration to elapse. this will allow us to advance to the next song
		const watchForTrackAutoAdvance = () => {
			//integrate the elapsed play time
			if (this.musicIsPlaying) {this.elapsedPlaySeconds += this.autoAdvanceIntervalSeconds}

			//if music has been loaded we can check for duration to be elapsed
			if (this.musicFileList[this.currentsongIndex]){
				if (this.elapsedPlaySeconds > this.musicFileList[this.currentsongIndex].duration + 2){
					this.skipForward()
				}
			}
		}

		//start the track advance watch	
		setInterval(watchForTrackAutoAdvance, this.autoAdvanceIntervalSeconds * 1000)	

		const saveSessionState = () => {
			if (this.settingsHaveChangedSinceSave){
				//packup the settings
				let state = new SessionState
				state.currentsongIndex = this.currentsongIndex
				state.musicIsPlaying = this.musicIsPlaying
				state.rolloffStartDistance = this.rolloffStartDistance
				state.spread = this.spread
				state.volume = this.volume
	
				//save to the db
				this.socket.emit('saveSessionState', this.context.sessionId, state)
				//reset the trigger
				this.settingsHaveChangedSinceSave = false
			}
		}

		//now that the settings have been loaed from the db 
		//start the setting save monitor
		setInterval(saveSessionState, this.settingsSaveIntervalSeconds * 1000)


		//define controls for the stream
		//each of these controls will have up/dn adjustment buttons
		//these controls will be replaced later with a better interface
		this.controls = [
			{
				label: "Volume", action: incr => this.setVolume(incr)
			},
			{
				label: "Spread", action: incr => {
					if (incr > 0) {
						this.spread = this.spread >= 0.9 ? 1.0 : this.spread + .1
					} else if (incr < 0) {
						this.spread = this.spread <= 0.1 ? 0.0 : this.spread - .1
					}
					this.adjustSoundParameters()
					return Math.floor(this.spread * 100) + "%"
				}
			},
			{
				label: "Rolloff", action: incr => {
					if (incr > 0) {
						//if we are over 1 use a larger increment value
						this.rolloffStartDistance += this.rolloffStartDistance > 1 ? 1 : 0.1
					} else if (incr < 0) {
						//if we are over 1 use a larger increment value
						this.rolloffStartDistance -= this.rolloffStartDistance > 1 ? 1 : 0.1
						//limit it to a minimum value
						this.rolloffStartDistance = this.rolloffStartDistance < 0.2 ? 0.2 : this.rolloffStartDistance
                    }
					this.adjustSoundParameters()
					return this.rolloffStartDistance.toPrecision(2).toString()
				}
			},
        ]
        
        //the controls are defined now we have to create them
		this.createControls(this.controls, MRE.Actor.Create(this.context, {
			actor: {
				name: 'controlsParent',
				parentId: rootActor.id,
				appearance:{ enabled: new MRE.GroupMask( this.context, ['moderator'])},
				transform: { local: { position: { x: 0, y: -1, z: 0 } } }
			}
		}))

		this.createDisplay(MRE.Actor.Create(this.context, {
			actor: {
				name: 'displayParent',
				parentId: rootActor.id,
				appearance:{ enabled: true},
				transform: { local: { position: { x: 0, y: -0.2, z: 0 } } }
			}
		}))

		//when the track list is delivered from the server set it as th active list
		this.socket.on("deliverReadDropBoxfolder", (dropboxFileList:AudioFileInfo[]) => {
			console.log("the returned file list: ", dropboxFileList)
			this.musicFileList = dropboxFileList
		})

		return true
	}

	
	/**
	 * use to adjust and set the volume
	 * @param incr 
	 */
	private setVolume = (incr:number) => {
		//change the volume if an up or down direction was requested
		if (incr > 0) {
			this.volume = this.volume >= 0.99 ? 1.0 : this.volume + .01
		} else if (incr < 0) {
			this.volume = this.volume <= 0.01 ? 0.0 : this.volume - .01
		}
		//format the volume in to a percentage string
		const volumeValue = `${Math.floor(this.volume * 100)}%`
		//once the volume label has been created set the label value when changes are made
		if (this.volumeLabel) this.volumeLabel.text.contents = `Volume:\n${volumeValue}`
		//commit the changes to the actual sound object
		this.adjustSoundParameters()
		//return the value to be used when the label is first created
		return volumeValue
	}

	/**
	 * toggles the music state
	 */
	private cycleMusicState(){
		//toggle the music state
		this.musicIsPlaying = !this.musicIsPlaying
		this.setMusicStateAppearance()
	}

	/**
	 * specifically sets the state to playing
	 */
	private setMusicStateToPlaying(){
		//toggle the music state
		this.musicIsPlaying = true
		this.setMusicStateAppearance()
	}

	/**
	 * sets the label and button appearance and 
	 */
	private setMusicStateAppearance(){
		//set the label with the state
		this.playStateLabel.text.contents = this.getPlayStateAsString()
		
		//set the appearance of both the panel and wrist controls
		this.playPauseButton.appearance.meshId = this.musicIsPlaying ? this.squareMesh.id : this.arrowMesh.id
		this.playPauseButton.appearance.materialId = this.musicIsPlaying ? this.stopButtonMaterial.id : this.playButtonMaterial.id
		this.playPauseButton.transform.local.rotation = MRE.Quaternion.FromEulerAngles(
			0, 
			0, 
			this.musicIsPlaying ? Math.PI * 0.25 : Math.PI * 0.5
		)

		//if the wrist controls have been created then we need to modify them aswell
		//if the play pause has a custom postion then don't mess with its rotation
		//do this for each of the wrist controls
		this.wristPlayPauseButtonStorageList.forEach(buttonStored => {
			if (buttonStored){
				buttonStored.button.appearance.meshId = this.musicIsPlaying ? this.squareMesh.id : this.arrowMesh.id
				buttonStored.button.appearance.materialId = this.musicIsPlaying ? this.stopButtonMaterial.id : this.playButtonMaterial.id
				if (!buttonStored.wristPlayPauseButtonHasBeenMoved){
					buttonStored.button.transform.local.rotation = MRE.Quaternion.FromEulerAngles(
						this.wristControlsRootPose.ori.x, 
						this.wristControlsRootPose.ori.y, 
						this.musicIsPlaying ? Math.PI * 0.25 : 0.5
					)
				}
			}
		})
		
		this.startStopTheParty()
	}

	/**
	 * toggles the play/pause state of the music
	 */
	private startStopTheParty(){
		//mark the sesion settings as changed
		this.settingsHaveChangedSinceSave = true
		//depending on the state control the party
		if (this.musicIsPlaying) {
			this.musicSoundInstance.resume()
		} else {
			this.musicSoundInstance.pause()
		}
	}

	/**
	 * a get function for the play state
	 */
	private getPlayStateAsString(){
		return "Playing:\n"+`${this.musicIsPlaying.toString()}`
	}

	/**
	 * advance to the next track
	 */
	private skipForward(){
		//increment the song index and roll it over when we get to the end of the list
		this.currentsongIndex = this.currentsongIndex > this.musicFileList.length-2 ? 0 : this.currentsongIndex + 1
		this.loadNextTrack()
		//mark the sesion settings as changed
		this.settingsHaveChangedSinceSave = true
	}

	/**
	 * skip back a track
	 */
	private skipBackward(){
		//increment the song index and roll it over when we get to the end of the list
		this.currentsongIndex = this.currentsongIndex < 1 ? this.musicFileList.length-2 : this.currentsongIndex - 1
		this.loadNextTrack()
		//mark the sesion settings as changed
		this.settingsHaveChangedSinceSave = true
	}

	/**
	 * clear the current track and load the next one
	 */
	private async loadNextTrack(){
		//reset the elapsed time
		this.elapsedPlaySeconds = 0

		//if the current sound exists stop it 
		if (this.musicSoundInstance) this.musicSoundInstance.stop()

		//recreate the asset container to dump the old track
		this.musicAssetContainer = new MRE.AssetContainer(this.context)

		//create the next sound if music has been loaded
		if (this.musicFileList[this.currentsongIndex]){

			if (this.useStreaming){
				this.createStreamInstance()
			}else{
				this.createAudioInstance()
			}

			//Leave the music in the same state
			//if it wasn't marked as playing then stop the newly loaded song
			if (!this.musicIsPlaying) {
				this.musicSoundInstance.pause()
			}

		}

		//set the track name label
		this.trackNameLabel.text.contents = this.musicFileList[this.currentsongIndex] ? this.musicFileList[this.currentsongIndex].name : 'Load Next Track'
	}


	/**
	 * use to adjust the state of the currently playing sound
	 */
	private adjustSoundParameters(){
		if (this.musicSoundInstance){
			this.musicSoundInstance.setState(
				{
					volume: this.volume,
					looping: false,
					spread: this.spread,
					rolloffStartDistance: this.rolloffStartDistance
				}
			)
		}

		//mark the sesion settings as changed
		console.log("marking the settings as changed")
		this.settingsHaveChangedSinceSave = true
	}

	/**
	 * use to create a streaming audio object
	 */
	private createStreamInstance(){
		//get the next track and create a video stream from it
		let file = this.musicFileList[this.currentsongIndex]
		console.log("playing next track: ", file)
		const currentMusicAsset = this.musicAssetContainer.createVideoStream(file.name, { uri: file.url})

		this.musicSoundInstance = this.musicSpeaker.startVideoStream(
			currentMusicAsset.id,
			{
				volume: this.volume,
				looping: false,
				spread: this.spread,
				rolloffStartDistance: this.rolloffStartDistance,
				time: this.elapsedPlaySeconds,
				visible: false
			}
		)

		//creating a stream always results in the music playing
		this.setMusicStateToPlaying()
	}

	/**
	 * use to create a file based audio object
	 */
	private createAudioInstance(){
		//get the next track and create an mre.sound from it
		let file = this.musicFileList[this.currentsongIndex]
		
		console.log("playing next track: ", file)
		this.currentMusicAsset = this.musicAssetContainer.createSound(file.name, { uri: file.url})

		//save the next sound into the active instance
		this.musicSoundInstance = this.musicSpeaker.startSound(
			this.currentMusicAsset.id,
			{
				volume: this.volume,
				looping: false,
				spread: this.spread,
				rolloffStartDistance: this.rolloffStartDistance,
				time: this.elapsedPlaySeconds
			}
		)
	}

	/**
	 * creates a display panel visible to all users
	 * @param parent 
	 */
	private createDisplay(parent: MRE.Actor){
		const layout = new MRE.PlanarGridLayout(parent)
		let currentLayoutRow = 0

		//create a label for the play/pause button
		layout.addCell({
			row: currentLayoutRow,
			column: 0,
			width: 0.3,
			height: 0.25,
			contents: this.trackNameLabel = MRE.Actor.Create(this.context, {
				actor: {
					name: 'trackNameLabel',
					parentId: parent.id,
					text: {
						contents: this.musicFileList[this.currentsongIndex] ? this.musicFileList[this.currentsongIndex].name : 'load track',
						height: 0.1,
						anchor: MRE.TextAnchorLocation.MiddleCenter,
						justify: MRE.TextJustify.Center,
						color: MRE.Color3.FromInts(255, 200, 255)
					}
				}
			})
		})
	}

	
	/**
     * loops through an array of controls adding up/dn buttons for each
     * @param controls 
     * @param parent 
     */
	private createControls(controls: ControlDefinition[], parent: MRE.Actor) {
		//define all of the meshes and materials
		this.arrowMesh = this.assets.createCylinderMesh('arrow', 0.01, 0.08, 'z', 3)
		this.squareMesh = this.assets.createCylinderMesh('square', 0.01, 0.08, 'z', 4)
		this.stopButtonMaterial = this.assets.createMaterial('stopButtonMaterial', {color:{a:1,r:1,g:0,b:0}, emissiveColor:{r:1,g:0,b:0}})
		this.playButtonMaterial = this.assets.createMaterial('playButtonMaterial', {color:{a:1,r:0,g:1,b:0}, emissiveColor:{r:0,g:1,b:0}})
		this.generalButtonMaterial = this.assets.createMaterial('generalButtonMaterial', {color:{a:1,r:0,g:115,b:255}, emissiveColor:{r:0,g:115,b:255}})
		this.volumeButtonMaterial = this.assets.createMaterial('volumeButtonMaterial', {color:{a:1,r:225,g:229,b:0}, emissiveColor:{r:225,g:229,b:0}})
		this.skipButtonMaterial = this.assets.createMaterial('skipButtonMaterial', {color:{a:1,r:255,g:0,b:133}, emissiveColor:{r:255,g:0,b:133}})
		const layout = new MRE.PlanarGridLayout(parent)

		let currentLayoutRow = 0
		let label: MRE.Actor, button: MRE.Actor

		//play/pause and skip controls
		//create a button for setting a new dropbox folder
		layout.addCell({
			row: currentLayoutRow,
			column: 0,
			width: 0.3,
			height: 0.25,
			contents: this.playPauseButton = MRE.Actor.Create(this.context, {
				actor: {
					name: 'playPauseButton',
					parentId: parent.id,
					appearance: { meshId: this.arrowMesh.id, materialId: this.playButtonMaterial.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 0.5) } }
				}
			})
		})

		//set the action for the button
		this.playPauseButton.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			this.cycleMusicState()
		})

		//create a label for the play/pause button
		layout.addCell({
			row: currentLayoutRow,
			column: 1,
			width: 0.3,
			height: 0.25,
			contents: this.playStateLabel = MRE.Actor.Create(this.context, {
				actor: {
					name: 'playPauseLabel',
					parentId: parent.id,
					text: {
						contents: this.getPlayStateAsString(),
						height: 0.1,
						anchor: MRE.TextAnchorLocation.MiddleCenter,
						justify: MRE.TextJustify.Center,
						color: MRE.Color3.FromInts(255, 200, 255)
					}
				}
			})
		})

		//create the skip forward button
		layout.addCell({
			row: currentLayoutRow,
			column: 3,
			width: 0.05,
			height: 0.25,
			contents: button = MRE.Actor.Create(this.context, {
				actor: {
					name: 'skipForwardButton',
					parentId: parent.id,
					appearance: { meshId: this.arrowMesh.id, materialId: this.skipButtonMaterial.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 0.5) } }
				}
			})
		})

		//set the action for the button
		button.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			this.skipForward()
		})

		//create the skip back button
		layout.addCell({
			row: currentLayoutRow,
			column: 2,
			width: 0.3,
			height: 0.25,
			contents: button = MRE.Actor.Create(this.context, {
				actor: {
					name: 'skipBackwardButton',
					parentId: parent.id,
					appearance: { meshId: this.arrowMesh.id, materialId: this.skipButtonMaterial.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, -Math.PI*.5) } }
				}
			})
		})

		//set the action for the button
		button.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			this.skipBackward()
		})

		//next row
		currentLayoutRow += 1

		//loop through the controls defined earlier
		//create buttons and set actions for each of them
		for (const controlDef of controls) {
			let label: MRE.Actor, more: MRE.Actor, less: MRE.Actor
			layout.addCell({
				row: currentLayoutRow,
				column: 1,
				width: 0.6,
				height: 0.25,
				contents: label = MRE.Actor.Create(this.context, {
					actor: {
						name: `${controlDef.label}-label`,
						parentId: parent.id,
						text: {
							contents: `${controlDef.label}:\n${controlDef.action(0)}`,
							height: 0.1,
							anchor: MRE.TextAnchorLocation.MiddleCenter,
							justify: MRE.TextJustify.Center,
							color: MRE.Color3.FromInts(255, 200, 255)
						}
					}
				})
			})
			controlDef.labelActor = label

			//save the volume label so it can be modified as needed
			if (controlDef.label == 'Volume') this.volumeLabel = label

			layout.addCell({
				row: currentLayoutRow,
				column: 0,
				width: 0.3,
				height: 0.25,
				contents: less = MRE.Actor.Create(this.context, {
					actor: {
						name: `${controlDef.label}-less`,
						parentId: parent.id,
						appearance: { meshId: this.arrowMesh.id, materialId: this.generalButtonMaterial.id },
						collider: { geometry: { shape: MRE.ColliderType.Auto } },
						transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, 0) } }
					}
				})
			})

			layout.addCell({
				row: currentLayoutRow,
				column: 2,
				width: 0.3,
				height: 0.25,
				contents: more = MRE.Actor.Create(this.context, {
					actor: {
						name: `${controlDef.label}-more`,
						parentId: parent.id,
						appearance: { meshId: this.arrowMesh.id, materialId: this.generalButtonMaterial.id },
						collider: { geometry: { shape: MRE.ColliderType.Auto } },
						transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI) } }
					}
				})
			})

			//if these are the volume buttons assign thier material
			if (controlDef.label == 'Volume'){
				less.appearance.materialId = this.volumeButtonMaterial.id
				more.appearance.materialId = this.volumeButtonMaterial.id
			}

			less.setBehavior(MRE.ButtonBehavior).onButton("pressed", () => {
				controlDef.labelActor.text.contents = `${controlDef.label}:\n${controlDef.action(-1)}`
			})

			more.setBehavior(MRE.ButtonBehavior).onButton("pressed", () => {
				controlDef.labelActor.text.contents = `${controlDef.label}:\n${controlDef.action(1)}`
			})

			//next row
			currentLayoutRow++
		}


		//create a button for setting a new dropbox folder
		layout.addCell({
			row: currentLayoutRow,
			column: 0,
			width: 0.3,
			height: 0.25,
			contents: button = MRE.Actor.Create(this.context, {
				actor: {
					name: 'setNewDropBoxButton',
					parentId: parent.id,
					appearance: { meshId: this.squareMesh.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 1.5) } }
				}
			})
		})

		//set the action for the button
		button.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			user.prompt("Enter your dropbox folder url", true).then(res => {
				if (res.submitted) this.socket.emit('readDropBoxFolder', res.text, user.context.sessionId)
			})
			.catch(err => {
				console.error(err)
			})
		})

		//create a label for the set folder button
		layout.addCell({
			row: currentLayoutRow,
			column: 1,
			width: 0.3,
			height: 0.25,
			contents: label = MRE.Actor.Create(this.context, {
				actor: {
					name: 'setNewDropBoxLabel',
					parentId: parent.id,
					text: {
						contents: '       Set dropbox folder',
						height: 0.1,
						anchor: MRE.TextAnchorLocation.MiddleCenter,
						justify: MRE.TextJustify.Right,
						color: MRE.Color3.FromInts(255, 200, 255)
					}
				}
			})
		})

		//next row
		currentLayoutRow += 1

		//create a button to spawn controls on the users wrist
		layout.addCell({
			row: currentLayoutRow,
			column: 0,
			width: 0.3,
			height: 0.25,
			contents: button = MRE.Actor.Create(this.context, {
				actor: {
					name: 'spawnControlsButton',
					parentId: parent.id,
					appearance: { meshId: this.squareMesh.id },
					collider: { geometry: { shape: MRE.ColliderType.Auto } },
					transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 1.5) } }
				}
			})
		})

		//set the action for the button
		button.setBehavior(MRE.ButtonBehavior).onButton("pressed", (user) => {
			this.spawnUserControls(user)
		})

		//create a label for the spawn button
		layout.addCell({
			row: currentLayoutRow,
			column: 1,
			width: 0.3,
			height: 0.25,
			contents: label = MRE.Actor.Create(this.context, {
				actor: {
					name: 'spawnWristControlsLabel',
					parentId: parent.id,
					text: {
						contents: '            Spawn Wrist Controls',
						height: 0.1,
						anchor: MRE.TextAnchorLocation.MiddleCenter,
						justify: MRE.TextJustify.Right,
						color: MRE.Color3.FromInts(255, 200, 255)
					}
				}
			})
		})

		layout.applyLayout()

	}


	/**
	 * spawn controls on the users wrist
	 * @param user 
	 */
	spawnUserControls(user: MRE.User) {

		const wristPlayPauseButton = MRE.Actor.Create(this.context, {
			actor: {
				appearance: { 
					meshId: this.musicIsPlaying ? this.squareMesh.id : this.arrowMesh.id, 
					materialId: this.musicIsPlaying ? this.stopButtonMaterial.id : this.playButtonMaterial.id 
				},
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { 
							x: this.wristControlsRootPose.pos.x + -0.05, 
							y: this.wristControlsRootPose.pos.y + 0.05, 
							z: this.wristControlsRootPose.pos.z + -0.115 
						},
						rotation: MRE.Quaternion.FromEulerAngles(this.wristControlsRootPose.ori.x, this.wristControlsRootPose.ori.y, this.musicIsPlaying ? Math.PI * 0.25 : 0.5),
						scale: { x: this.wristControlsScale, y: this.wristControlsScale, z: 0.5 },
					}
				},
				attachment: {
					attachPoint: "left-hand",
					userId: user.id
				},
				grabbable:true
			}
		})

		const volumeUpButton = MRE.Actor.Create(this.context, {
			actor: {
				appearance: { meshId: this.arrowMesh.id, materialId: this.volumeButtonMaterial.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { 
							x: this.wristControlsRootPose.pos.x + -0.05, 
							y: this.wristControlsRootPose.pos.y + 0.05, 
							z: this.wristControlsRootPose.pos.z + -0.075 
						},
						rotation: MRE.Quaternion.FromEulerAngles(this.wristControlsRootPose.ori.x, this.wristControlsRootPose.ori.y, 0),
						scale: { x: this.wristControlsScale, y: this.wristControlsScale, z: 0.5 },
					}
				},
				attachment: {
					attachPoint: "left-hand",
					userId: user.id
				},
				grabbable:true
			}
		})

		const volumeDnButton = MRE.Actor.Create(this.context, {
			actor: {
				appearance: { meshId: this.arrowMesh.id, materialId: this.volumeButtonMaterial.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { 
							x: this.wristControlsRootPose.pos.x + -0.05, 
							y: this.wristControlsRootPose.pos.y + 0.05, 
							z: this.wristControlsRootPose.pos.z + -0.0465 
						},
						rotation: MRE.Quaternion.FromEulerAngles(this.wristControlsRootPose.ori.x, this.wristControlsRootPose.ori.y, 1),
						scale: { x: this.wristControlsScale, y: this.wristControlsScale, z: 0.5 },
					}
				},
				attachment: {
					attachPoint: "left-hand",
					userId: user.id
				},
				grabbable:true
			}
		})

		const skipBackButton = MRE.Actor.Create(this.context, {
			actor: {
				appearance: { meshId: this.arrowMesh.id, materialId: this.skipButtonMaterial.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { 
							x: this.wristControlsRootPose.pos.x + -0.05, 
							y: this.wristControlsRootPose.pos.y + 0.05, 
							z: this.wristControlsRootPose.pos.z + -0.005 
						},
						rotation: MRE.Quaternion.FromEulerAngles(this.wristControlsRootPose.ori.x, this.wristControlsRootPose.ori.y, -0.5),
						scale: { x: this.wristControlsScale, y: this.wristControlsScale, z: 0.5 },
					}
				},
				attachment: {
					attachPoint: "left-hand",
					userId: user.id
				},
				grabbable:true
			}
		})

		const skipForwardButton = MRE.Actor.Create(this.context, {
			actor: {
				appearance: { meshId: this.arrowMesh.id, materialId: this.skipButtonMaterial.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { 
							x: this.wristControlsRootPose.pos.x + -0.05, 
							y: this.wristControlsRootPose.pos.y + 0.05, 
							z: this.wristControlsRootPose.pos.z + 0.02 
						},
						rotation: MRE.Quaternion.FromEulerAngles(this.wristControlsRootPose.ori.x, this.wristControlsRootPose.ori.y, 0.5),
						scale: { x: this.wristControlsScale, y: this.wristControlsScale, z: 0.5 },
					}
				},
				attachment: {
					attachPoint: "left-hand",
					userId: user.id
				},
				grabbable:true
			}
		})


		//define behaviors for all of the buttons 

		const volumeUpButtonBehavior = volumeUpButton.setBehavior(MRE.ButtonBehavior)
		volumeUpButtonBehavior.onButton("pressed", () => {
			this.setVolume(1)
		})

		const volumeDnButtonBehavior = volumeDnButton.setBehavior(MRE.ButtonBehavior)
		volumeDnButtonBehavior.onButton("pressed", () => {
			this.setVolume(-1)
		})

		const skipForwardButtonBehavior = skipForwardButton.setBehavior(MRE.ButtonBehavior)
		skipForwardButtonBehavior.onButton("pressed", () => {
			this.skipForward()
		})

		const skipBackButtonBehavior = skipBackButton.setBehavior(MRE.ButtonBehavior)
		skipBackButtonBehavior.onButton("pressed", () => {
			this.skipBackward()
		})

		const playPauseButtonBehavior = wristPlayPauseButton.setBehavior(MRE.ButtonBehavior)
		playPauseButtonBehavior.onButton("pressed", () => {
			this.cycleMusicState()
		})

		//store the button and its status so it can be managed in the future
		const buttonStorage = new ButtonStorage
		buttonStorage.button = wristPlayPauseButton
		//track if the play pause button has been moved to a custom postion
		wristPlayPauseButton.onGrab("begin", state => {buttonStorage.wristPlayPauseButtonHasBeenMoved = true})
		//add the play pause button to the list 
		this.wristPlayPauseButtonStorageList.push(buttonStorage)

	}

}