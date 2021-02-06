# CrossWatch
CrossWatch aims to be a simple, generalised watch party extension for Google Chrome, made to be easily adaptable to different streaming services, and to be able to synchronise videos between different streaming services.

CrossWatch is derived from [Roll Together](https://github.com/samuraiexx/roll_together). If you're doing just a CrunchyRoll watch party specifically, you should probably go there instead, as it's going to be more specialised for CrunchyRoll. This extension aims at being adaptable to different services, and so removes some code and functionality that Roll Together has. The idea is that you should be able to do a party watch across, for example, both CrunchyRoll, Funimation (USA/UK) and Wakanim (certain EU countries). Both CrunchyRoll, Wakanim and Funimation should be possible now.

For now, it uses the exact same backend code as the [Roll Together Backend](https://github.com/samuraiexx/roll_together_backend), and transmits only video state and progress, and nothing about the service or which video you're watching. This simplicity was the reason I got the idea of generalising the extension across multiple services. Many streaming services are regional, and shows are sometimes licensed by different streaming services in different regions. Being able to synchronise a watch party across streaming services would be a cool feature for international online communities. The only changes I will be making in the backend is to the package name, and perhaps to how the binding address is set up. I'm not myself interested in running an instance for public use, but maybe I can make it a bit easier for communities to set up instances themselves.

## How to use it
It is now available on the Chrome Store: https://chrome.google.com/webstore/detail/crosswatch/bbnnjociplbmdbfmcnmmoingcmfincdh

I do not at the moment run a public server for the extension, so you will have to set up a server of your own (link for backend code below).

## Related Repos
Backend repo: https://github.com/praabjerg/crosswatch_backend
At the moment, this is a practically unchanged fork of the [Roll Together Backend](https://github.com/samuraiexx/roll_together_backend), and is likely to remain so, at least for a while. For now, I keep a fork mostly for convenience.

## Inspiration and Support
I'm a member of the community associated with [Anime Feminist](https://animefeminist.com), and the inspiration for this fork came in part from our own party watch activities, and in part from skimming through [Roll Together](https://github.com/samuraiexx/roll_together), and seeing how simple a party watch extension can be (so a bunch of thanks goes to [samuriexx](https://github.com/samuraiexx) as well for making this relatively easy to achieve!).

Anime Feminist is not involved in this project in any way, but please consider [supporting them](https://www.animefeminist.com/site-update-fundraiser-realities-and-scheduling-changes/). They do great work!
