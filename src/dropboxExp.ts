
import * as musicMetadata from 'music-metadata-browser'
import express from 'express'
import puppeteer from "puppeteer"
import Global = NodeJS.Global

export interface GlobalWithCognitoFix extends Global {
    fetch: any
}
declare const global: GlobalWithCognitoFix;
global.fetch = require('node-fetch')


export default class DropboxMetaCollector{


    constructor(){

    }


    async getFileMetadata(url:string): Promise<musicMetadata.IAudioMetadata> {

        const app = express()
        let data : Promise<musicMetadata.IAudioMetadata>

        app.get('/', function (req, res) {
            res.send('Hello World!')
            console.log("getting meta for file at: ", url)
            data = musicMetadata.fetchFromUrl(url)
            console.log("data: ", data)
        })

        const port = process.env.PORT+2 || 3904
            app.listen(port, function () {
            console.log('myapp listening on port ' + port);
        })

        const browser = await puppeteer.launch({headless: false});
        const page = await browser.newPage();
        await page.goto("http://127.0.0.1:3904")

        return await data
    }
}