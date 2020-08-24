/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk'
import delay from './delay'
import Prompt from './prompt'
import fs from 'fs'
import AudioFileInfo from './types'
import { Collider } from '@microsoft/mixed-reality-extension-sdk'


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


export default class SoundTest{

	protected modsOnly = true
	private assets: MRE.AssetContainer
	private musicAssets: MRE.AssetContainer

	private autoAdvanceIntervalSeconds = 2
	private musicIsPlaying = false
	private elapsedPlaySeconds = 0
	private dopplerSoundState = 0
	private currentsongIndex = 0
	private musicSpeaker : MRE.Actor
	private musicSoundInstance : MRE.MediaInstance
	controls: ControlDefinition[] = []
	private volume = 0.04
	private spread = 0.4
	private rolloffStartDistance = 2.5

	prompt : Prompt


    /**
     * create an instance
     * @param context 
     * @param baseUrl 
     */
    constructor(private context: MRE.Context, private baseUrl: string, private musicFileInfo: AudioFileInfo[]){

    }

	/**
	 * unload all asset containers
	 */
	public cleanup() {
		this.assets.unload()
		this.cleanUpMusic()
	}
	
	/**
	 * unload the music asset container
	 */
	public cleanUpMusic() {
		this.musicAssets.unload()
	}
	

    /**
     * Create the player and controls in world
     * @param rootActor 
     */
	public async run(rootActor: MRE.Actor): Promise<boolean> {

		this.prompt = new Prompt(this.context, this.baseUrl)
		this.assets = new MRE.AssetContainer(this.context)
		this.musicAssets = new MRE.AssetContainer(this.context)

		this.musicSpeaker = MRE.Actor.Create(this.context, {
			actor: {
				name: `TheSoundSpeaker`,
				parentId: rootActor.id,
			}
		})


		//read the directory contents of the web based folder
		// const fileList = fs.readdirSync(`${this.baseUrl}/publc`)
		// console.log("the folder contained: ", fileList)
		//get track properties for each of the files




		//watch for the track duration to elapse. this will allow us to advance to the next song
		const watchForTrackAutoAdvance = () => {
			//integrate the elapsed play time
			if (this.musicIsPlaying) {this.elapsedPlaySeconds += this.autoAdvanceIntervalSeconds}

			// console.log(`It's been ${this.elapsedPlaySeconds} seconds since the song started`)
			if (this.elapsedPlaySeconds > this.musicFileInfo[this.currentsongIndex].duration + 2) loadNextTrack()
		}

		//start the track advance watch	
		setInterval(watchForTrackAutoAdvance, this.autoAdvanceIntervalSeconds * 1000)	

		//clear the current track and load the next one
		const loadNextTrack = () => {
			//reset the elapsed time
			this.elapsedPlaySeconds = 0

			//increment the song index and roll it over when we get to the end of the list
			this.currentsongIndex = this.currentsongIndex > this.musicFileInfo.length-2 ? 0 : this.currentsongIndex + 1

			//if the current sound exists stop it 
			if (this.musicSoundInstance) this.musicSoundInstance.stop()

			//unload the current music so we don't use all the memory
			this.cleanUpMusic()

			//recreate the asset container
			this.musicAssets = new MRE.AssetContainer(this.context)

			//create the next sound
			let file = this.musicFileInfo[this.currentsongIndex]
			console.log("playing next track: ", file)
			const currentMusicAsset = this.musicAssets.createSound(file.name, { uri: file.url})

			//save the next sound into the active instance
			this.musicSoundInstance = this.musicSpeaker.startSound(
				currentMusicAsset.id,
				{
					volume: this.volume,
					looping: false,
					doppler: 0.0,
					spread: 0.4,
					rolloffStartDistance: 2.5,
					time: 0.0
				}
			)
		}

		//load the first sound into the object
		loadNextTrack()
		
		//default to paused
        this.musicSoundInstance.pause()
		
        //define pause/resume control
		const cycleMusicState = () => {
			//toggle the music state
			this.musicIsPlaying = !this.musicIsPlaying
			//depending on the state control the party
			if (this.musicIsPlaying) {
				this.musicSoundInstance.resume()
			} else {
				this.musicSoundInstance.pause()
			}
        }
        
		//use to adjust the state of the currently playing sound
		const adjustSoundState = () => {
			this.musicSoundInstance.setState(
				{
					volume: this.volume,
					looping: false,
					doppler: 0.0,
					spread: this.spread,
					rolloffStartDistance: this.rolloffStartDistance
				}
			)
		}

		//define controls for the stream
        //each of these controls will have up/dn adjustment buttons
		this.controls = [
			{
				label: "Playing", realtime: true, action: incr => {
					if (incr !== 0) {
						if (!this.musicIsPlaying) {
							cycleMusicState()
						} else {
							cycleMusicState()
						}
					}
					return this.musicIsPlaying.toString()
				}
			},
			{
				label: "Volume", action: incr => {
					if (incr > 0) {
						this.volume = this.volume >= 0.99 ? 1.0 : this.volume + .01
					} else if (incr < 0) {
						this.volume = this.volume <= 0.01 ? 0.0 : this.volume - .01
					}
					adjustSoundState()
					return Math.floor(this.volume * 100) + "%"
				}
			},
			{
				label: "Spread", action: incr => {
					if (incr > 0) {
						this.spread = this.spread >= 0.9 ? 1.0 : this.spread + .1
					} else if (incr < 0) {
						this.spread = this.spread <= 0.1 ? 0.0 : this.spread - .1
					}
					adjustSoundState()
					return Math.floor(this.spread * 100) + "%"
				}
			},
			{
				label: "Rolloff", action: incr => {
					if (incr > 0) {
						this.rolloffStartDistance += .1
					} else if (incr < 0) {
						this.rolloffStartDistance = this.rolloffStartDistance <= 0.3 ? 0.2 : this.rolloffStartDistance - .1
                    }
					adjustSoundState()
					return this.rolloffStartDistance.toPrecision(2).toString()
				}
			},
        ]
        
        //the controls are defined now we have to create them
		this.createControls(this.controls, MRE.Actor.Create(this.context, {
			actor: {
				name: 'controlsParent',
				parentId: rootActor.id,
				transform: { local: { position: { x: 0.6, y: -1, z: -1 } } }
			}
		}))


		return true
	}



	/**
     * loops through an array of controls adding up/dn buttons for each
     * @param controls 
     * @param parent 
     */
	private createControls(controls: ControlDefinition[], parent: MRE.Actor) {
		const arrowMesh = this.assets.createCylinderMesh('arrow', 0.01, 0.08, 'z', 3)
		const layout = new MRE.PlanarGridLayout(parent)

		let i = 0

		for (const controlDef of controls) {
			let label: MRE.Actor, more: MRE.Actor, less: MRE.Actor
			layout.addCell({
				row: i,
				column: 1,
				width: 0.3,
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

			layout.addCell({
				row: i,
				column: 0,
				width: 0.3,
				height: 0.25,
				contents: less = MRE.Actor.Create(this.context, {
					actor: {
						name: `${controlDef.label}-less`,
						parentId: parent.id,
						appearance: { meshId: arrowMesh.id },
						collider: { geometry: { shape: MRE.ColliderType.Auto } },
						transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 1.5) } }
					}
				})
			})

			layout.addCell({
				row: i,
				column: 2,
				width: 0.3,
				height: 0.25,
				contents: more = MRE.Actor.Create(this.context, {
					actor: {
						name: `${controlDef.label}-more`,
						parentId: parent.id,
						appearance: { meshId: arrowMesh.id },
						collider: { geometry: { shape: MRE.ColliderType.Auto } },
						transform: { local: { rotation: MRE.Quaternion.FromEulerAngles(0, 0, Math.PI * 0.5) } }
					}
				})
			})

			less.setBehavior(MRE.ButtonBehavior).onButton("pressed", () => {
				controlDef.labelActor.text.contents = `${controlDef.label}:\n${controlDef.action(-1)}`
			})

			more.setBehavior(MRE.ButtonBehavior).onButton("pressed", () => {
				controlDef.labelActor.text.contents = `${controlDef.label}:\n${controlDef.action(1)}`
			})

			i++
		}

		layout.applyLayout()

	}

}