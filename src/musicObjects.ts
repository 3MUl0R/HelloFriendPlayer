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


export default class SoundTest{

	protected modsOnly = true
	private assets: MRE.AssetContainer
	private musicAssets: MRE.AssetContainer

	private autoAdvanceIntervalSeconds = 2
	private musicIsPlaying = false
	private elapsedPlaySeconds = 0
	private _dopplerSoundState = 0
	private currentsongIndex = 0
	private musicButton : MRE.Actor
	private musicSoundInstance : MRE.MediaInstance

	prompt : Prompt

	// Chords for the first few seconds of The Entertainer
	private chords: number[][] = [
		[2 + 12],
		[4 + 12],
		[0 + 12],
		[-3 + 12],
		[],
		[-1 + 12],
		[-5 + 12],
		[],
		[2],
		[4],
		[0],
		[-3],
		[],
		[-1],
		[-5],
		[],
		[2 - 12],
		[4 - 12],
		[0 - 12],
		[-3 - 12],
		[],
		[-1 - 12],
		[-3 - 12],
		[-4 - 12],
		[-5 - 12],
		[],
		[],
		[],
		[-1, 7]
    ]
    

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
     * make it happen
     * @param rootActor 
     */
	public async run(rootActor: MRE.Actor): Promise<boolean> {

		this.prompt = new Prompt(this.context, this.baseUrl)
		this.assets = new MRE.AssetContainer(this.context)
		this.musicAssets = new MRE.AssetContainer(this.context)
		const buttonMesh = this.assets.createSphereMesh('sphere', 0.2, 8, 4)

		this.musicButton = MRE.Actor.Create(this.context, {
			actor: {
				name: 'MusicButton',
				parentId: rootActor.id,
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { x: -0.8, y: 1.3, z: -0.2 }
					}
				}
			}
		})
		
		const musicNextButton = MRE.Actor.Create(this.context, {
			actor: {
				name: 'MusicNextButton',
				parentId: rootActor.id,
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { x: -0.4, y: 1.5, z: -0.2 },
						scale: { x: 0.4, y: 0.4, z: 0.4 }
					}
				}
			}
		})

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
			this.musicSoundInstance = this.musicButton.startSound(
				currentMusicAsset.id,
				{
					volume: 0.04,
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
		
		//create the button behaviors
		const musicButtonBehavior = this.musicButton.setBehavior(MRE.ButtonBehavior)
        const musicNextButtonBehavior = musicNextButton.setBehavior(MRE.ButtonBehavior)
		
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
        
		musicButtonBehavior.onButton('pressed', cycleMusicState)
		musicNextButtonBehavior.onButton('pressed', loadNextTrack)


		const notesButton = MRE.Actor.Create(this.context, {
			actor: {
				name: 'NotesButton',
				parentId: rootActor.id,
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { x: 0, y: 1.3, z: -0.2 }
					}
				}
			}
		})

		const notesAsset = this.assets.createSound(
			'piano',
			{ uri: `${this.baseUrl}/Piano_C4.wav` }
		)

        const notesButtonBehavior = notesButton.setBehavior(MRE.ButtonBehavior)
        
		const playNotes = async () => {
			for (const chord of this.chords) {
				for (const note of chord) {
					notesButton.startSound(notesAsset.id, {
						doppler: 0.0,
						pitch: note,
					})
				}
				await delay(200)
			}
        }
        
		notesButtonBehavior.onButton('released', playNotes)

		const dopplerButton = MRE.Actor.Create(this.context, {
			actor: {
				name: 'DopplerButton',
				parentId: rootActor.id,
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { x: 0.8, y: 1.3, z: -0.2 }
					}
				}
			}
        })
        
		const dopplerMover = MRE.Actor.Create(this.context, {
			actor: {
				parentId: dopplerButton.id,
				name: 'DopplerMover',
				appearance: { meshId: this.assets.createSphereMesh('doppler', 0.15, 8, 4).id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { x: 0, y: 0, z: 3 }
					}
				}
			}
        })
        
		const spinAnim = await this.assets.createAnimationData(
			'flyaround',
			this.generateSpinKeyframes(2.0, MRE.Vector3.Up())
		).bind({target: dopplerButton}, {wrapMode: MRE.AnimationWrapMode.Loop})

		const dopplerAsset = this.assets.createSound(
			'truck',
			{ uri: `${this.baseUrl}/Car_Engine_Loop.wav` }
        )
        
		const dopplerSoundInstance = dopplerMover.startSound(dopplerAsset.id,
			{
				volume: 0.5,
				looping: true,
				doppler: 5.0,
				spread: 0.3,
				rolloffStartDistance: 9.3
            }
        )

        dopplerSoundInstance.pause()
        
        const dopplerButtonBehavior = dopplerButton.setBehavior(MRE.ButtonBehavior)
        
		const cycleDopplerSoundState = () => {
			if (this._dopplerSoundState === 0) {
				dopplerSoundInstance.resume()
				spinAnim.play()

			} else if (this._dopplerSoundState === 1) {
				spinAnim.stop()
				dopplerSoundInstance.pause()
			}
			this._dopplerSoundState = (this._dopplerSoundState + 1) % 2
		}
		dopplerButtonBehavior.onButton('released', cycleDopplerSoundState)


		const promptButton = MRE.Actor.Create(this.context, {
			actor: {
				name: 'PromptButton',
				parentId: rootActor.id,
				appearance: { meshId: buttonMesh.id },
				collider: { geometry: { shape: MRE.ColliderType.Auto } },
				transform: {
					local: {
						position: { x: 1.6, y: 1.3, z: -0.2 }
					}
				}
			}
		})
		
        const promptButtonBehavior = promptButton.setBehavior(MRE.ButtonBehavior)

		promptButtonBehavior.onButton('pressed', () => {
			this.prompt.run(rootActor)
		})

		return true
	}


    /**
	 * use to generate the key frames of an orbiting animation
	 * @param duration 
	 * @param axis 
	 * @param start 
	 */
	private generateSpinKeyframes(duration: number, axis: MRE.Vector3, start = 0): MRE.AnimationDataLike {
		return {
			tracks: [{
				target: MRE.ActorPath("target").transform.local.rotation,
				keyframes: [{
					time: 0 * duration,
					value: MRE.Quaternion.RotationAxis(axis, start)
				}, {
					time: 0.25 * duration,
					value: MRE.Quaternion.RotationAxis(axis, start + Math.PI * 1 / 2)
				}, {
					time: 0.5 * duration,
					value: MRE.Quaternion.RotationAxis(axis, start + Math.PI * 2 / 2)
				}, {
					time: 0.75 * duration,
					value: MRE.Quaternion.RotationAxis(axis, start + Math.PI * 3 / 2)
				}, {
					time: 1 * duration,
					value: MRE.Quaternion.RotationAxis(axis, start + Math.PI * 4 / 2)
				}]
			} as MRE.Track<MRE.Quaternion>]
		}
	}

	loadMusic = (array:MRE.Sound[]) => {
		this.musicSoundInstance = this.musicButton.startSound(
			array[ this.currentsongIndex ].id,
			{
				volume: 0.2,
				looping: false,
				doppler: 0.0,
				spread: 0.7,
				rolloffStartDistance: 2.5,
				time: 0.0
            }
		)
	}



}