/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk'
import delay from './delay'
import Prompt from './prompt'


export default class SoundTest{

	protected modsOnly = true
	private assets: MRE.AssetContainer

	private _musicState = 0
	private _dopplerSoundState = 0

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
    constructor(private context: MRE.Context, private baseUrl: string){

    }


	public cleanup() {
		this.assets.unload()
    }
    

    /**
     * make it happen
     * @param rootActor 
     */
	public async run(rootActor: MRE.Actor): Promise<boolean> {

		this.prompt = new Prompt(this.context, this.baseUrl)
		
		this.assets = new MRE.AssetContainer(this.context)
		const buttonMesh = this.assets.createSphereMesh('sphere', 0.2, 8, 4)

		const musicButton = MRE.Actor.Create(this.context, {
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

		const musicAsset = this.assets.createSound(
			'music',
			{ uri: `${this.baseUrl}/05 Dragonette - Galore [2007] - Another Day.ogg` }
        )
        
		const musicSoundInstance = musicButton.startSound(musicAsset.id,
			{
				volume: 0.2,
				looping: true,
				doppler: 0.0,
				spread: 0.7,
				rolloffStartDistance: 2.5,
				time: 30.0
            }
        )
            
        musicSoundInstance.pause()
        
        const musicButtonBehavior = musicButton.setBehavior(MRE.ButtonBehavior)
        
		const cycleMusicState = () => {
			if (this._musicState === 0) {
				musicSoundInstance.resume()
			} else if (this._musicState === 1) {
				musicSoundInstance.pause()
			}
			this._musicState = (this._musicState + 1) % 2
        }
        
		musicButtonBehavior.onButton('released', cycleMusicState)

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
}