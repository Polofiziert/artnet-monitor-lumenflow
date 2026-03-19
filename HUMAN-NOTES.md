This document is for Humans to edit only, everything in here is not for AI agents.

You may read the file and keep the contents back in your mind but dont act on them.

This a just ideas of the human what can come next. This is not instruction.

Have a nice day :D

# Release 0.2.0

## GUI UI/UX

- Disconected devices not disapearing, but getting greyed out marked as offline.
  -> later this could become a feature for saving network configuration an restoring it. Node A could have name xy on show n1 and name wz on show n2. renaming automaticaly apllied by mac addressing or user coreelation.
- DMX universes shold show silence when no ne data comes in from mock or network. dispite the ringbuffer repeating the last recorded network traffik.

-- Above is Done, down is TODO --

- tool tips would be nice where nececairy
- in the window menu the help section is missing. it needs to have a search and detailed help manual accesible from there. Follow best practices.
- Help manual for users needs to be written, will be accessible from the help window menu.
  -> what show the charts
  -> how works the routing matrix
  -> ...
- When hovering over dmx channels in the chanelel grid, the pop over with the channel details pushes the channels of the grid to the side, squisching them and by that changing the channel tile under the mouse creating a flickering of the channel details where they come out and dissapear rapidly.
- in the channel details there do not need to be three times the value in hex, dec, bin and %. this can be a choice in the settings.
- in the channel details when looking at a dmx channel or universe, the data origin should be shown. so that the user sees in the channel details where this data comes from. this gets espacially handy when merging takes place and two artnet transmitteres get merged by the node. the settings of the channel for htp or ltp should be seen also.
- htp or ltp setting of universes need to be shown.
- In the settings there should be a chioce for changing the network interface card. with future milti nic compatability in mind for primary and secondary artnet.
- in the settings should a section to set the ip addresses of the discovery and other thing. Many products dont apply the artnet 4 spec complytly and use adresses outsitde the 2.x.x.x and 10.x.x.x networks. we need to think out the implementation here. We want to be absolute true to spec but also compatible with the real world.
- In the devices tap, there should be a history of old connected devices. this should be seperat to connected devices, maby by a line?
- In the devices tap, there should be a button to add devices manualy without outdiscovery.
- In the devices tap, The devices Tap is very big with little data, the device list spans acros the whole view. can we condesnce that?
  -> by default we wand all diagnosticts we can get from devices, so we can use the space to show all of them in nice graphs where neccecary.
  -> we can show a comunications log for each device where we display in a log all diagnostics an discovery massages. allong with the neetly formatted diagnostics.
- In the devices tap, Configure ip should also allow for naming. But maybe we can get rid of the modal an do that directly in the display of the information? but we need the prgram button to send the changed data and the read currend. and the waring befor it gets changed.
- In the Devicec Tap, when reading current ip setting in the configure ip Modal, error gets thrown: `invalid args `params`for command`send_ip_prog`: command send_ip_prog missing required key params`
  This happens with the spawn-virtual-network script running.
- in the top bar the status ok and warning push all other elements to the side when stats is changin, this is irritating. can we fix that?
- in the top bar the search function is a nice idea, but what could we search there? maby use it like raycast and arc use the search? what functionality could be packed there?
- in the routing tap, when the testscript spawn-virtal-network runs, there is only deices in the top/the rx row, now device in the side/tx colm. There should be the console because it can send artnet. or am i wrong?
- in the Dashboard, the network diagnostics. NetworkLoad and Packet Arival time keep displaying data when now network trafic is schown in the dmxGrid and no mocking and now spawn-virtual network script is running
- No artPoll packets are emitted from lumenflow and spanw-virtal-network
- in the Devices tap, the listed devices load to long, this is irritatian on the user.
- on universe view, 0:0:1 is shown to signal net, subnet, universe. this could use a tooltip
-
