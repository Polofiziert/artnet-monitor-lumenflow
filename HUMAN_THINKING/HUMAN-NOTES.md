This document is for Humans to edit only, everything in here is not for AI agents.

You may read the file and keep the contents back in your mind but dont act on them.

This a just ideas of the human what can come next. This is not instruction.

Have a nice day :D

# Release 0.2.0

## GUI UI/UX

### Done

- Disconected devices not disapearing, but getting greyed out marked as offline.
-> later this could become a feature for saving network configuration an restoring it. Node A could have name xy on show n1 and name wz on show n2. renaming automaticaly apllied by mac addressing or user coreelation.
- DMX universes shold show silence when no ne data comes in from mock or network. dispite the ringbuffer repeating the last recorded network traffik.
- No artPoll packets are emitted from lumenflow and spanw-virtal-network
- in the channel details there do not need to be three times the value in hex, dec, bin and %. this can be a choice in the settings.
- In the devices tap, there should be a history of old connected devices. this should be seperat to connected devices, maby by a line?
- in the top bar the status ok and warning push all other elements to the side when stats is changin, this is irritating. can we fix that?
- in the routing tap, when the testscript spawn-virtal-network runs, there is only deices in the top/the rx row, no device in the side/tx colm. There should be the console because it can send artnet. or am i wrong? 
- in the Dashboard, the network diagnostics. NetworkLoad and Packet Arival time keep displaying data when now network trafic is schown in the dmxGrid and no mocking and now spawn-virtual network script is running
- the toggle switches in the settings are missaligned when turned on, they are in the on possition when turned of.
- in the sunlight the programm isnt good to read, we need a light mode with contrast so technitions on a festival in brigth sunlight can use the software easaly
  - this setting should live in the settings of lumenflow
  - it should be one of the first settings
  - it should be changeble from dark to light to system
- in the top bar the status ok and warning isnt telling much. this short indicator is good but it needs a tool tip with the informtion on wich the status ok / warning label changes. so the user knows what it means.
- In Devices tab, the green dots before an the prot name in the list should flash with every ne incoming artPollReply. When bindIndex is used it should only flash once for every bundle of ArtPollReply packets.
  - this is to indicate the ongoing reports to Luumenflow

### Partialy Implemented

- in the channel details when looking at a dmx channel or universe, the data origin should be shown. so that the user sees in the channel details where this data comes from. this gets espacially handy when merging takes place and two artnet transmitteres get merged by the node. the settings of the channel for htp or ltp should be seen also.
  - this should be a dropdown with the Node Long Name as Title, in the dropdown there should be node ip and short status info.
  - htp or ltp setting of universes need to be shown.
- In the settings there should be a chioce for changing the network interface card. with future milti nic compatability in mind for primary and secondary artnet.
- in the settings should a section to set the ip addresses of the discovery and other thing. Many products dont apply the artnet 4 spec complytly and use adresses outsitde the 2.x.x.x and 10.x.x.x networks. we need to think out the implementation here. We want to be absolute true to spec but also compatible with the real world.
- In the devices tap, there should be a button to add devices manualy without outdiscovery.
- In the devices tap, The devices Tap is very big with little data, the device list spans acros the whole view. can we condesnce that?
-> by default we wand all diagnosticts we can get from devices, so we can use the space to show all of them in nice graphs where neccecary.
-> we can show a comunications log for each device where we display in a log all diagnostics an discovery massages. allong with the neetly formatted diagnostics.
  - This happens with the spawn-virtual-network script running.
- on universe view, 0:0:1 is shown to signal net, subnet, universe. this uses a tooltip that shows, Net: 0, Sub-Net: 0, Universe: 1. so the user understands it.
  - the  PortAddress: 1 is missing in this tooltap
- channel graph is missaligned to the right a little bit.
  - no the line doesnt fill the graph comleatly
  - it desnt start at the beginning left of the graph but ends on its right end
- a overhall of the system window menue from the os is nececairy, a plan needs to be made what there should be in.
  - View should have the Dashboard, Inspector, Matrix, Devices taps as field with Keyboard shortcuts as Grey comments bhind it.
  - Settings also should be accecible from there.
  - What else is needed? Think about it ...
- in the window menu the help section is missing. it needs to have a search and detailed help manual accesible from there. Follow best practices. 
  - explaine the Features of the Program
  - where protocol related things are present in the manual, reffer to the Art-Net 4Spec with page numbers.
  - Help manual for users needs to be written, should be accessible from the help window menu.  
  -> what show the charts  
  -> how works the routing matrix  
  -> ...
- In the Devices Tab, Changing chageable informations like IP, Long-Name, Port-Name,... Should behave like a form not a modal.
  - with a double click the displayed text should become editable. When pressing enter the value is sent to the Device. For relevant information a warning is shown, espacially for IP and dhcp mode. (everything that can disconnect the device from network and make recovery challenging on site behind stage with time Pressure)
  - the value of the field should allways only display the value of the last ArtPollReply. 
    - When, after editing in ui and sending the ArtAddress packet for changing to new value, the value of the next ArtPollReply doesnt has changend, only a warning like in an registration form should be shown near the field in the device tab.
  - this is the same for all datamodles of the device, incoming artPollReply data overseeds the programmed data. when artPollReply data doenst change, this is an error on the device side and its state doesnt change. so we need to reflect that and or data modle of the device stays true to device state.
    - for this purpose there should stay a "Read-Current" button that reloads all device related data from network. its a redundant thing because lumenflow shouldnt get out of sync with real data but you never know. better save then sorry.

#### Needs Testing / Observation

- In the Devicec Tap, when reading current ip setting in the configure ip Modal, error gets thrown: `invalid args` params`for command`send_ip_prog`: command send_ip_prog missing required key params`
This happens with the spawn-virtual-network script running.

### To be Implemented

#### Devices Tab

### Inspector

- in the channel details when looking at a dmx channel or universe, the output ports should be shown
  - like the origin node this should be a dropdown with every destination port, its node name, protocol and status should be shown.

### Dashboard

- In the Universe Titel Bar in Dashboard and Inspector the Label: avg 123 in the wrong order, it should be 123 avg.

# Release v0.3.0

## Network hardening

What happens when a cable is rippd out and a device dissaperas from network? when, for example a technician falls over a cable and ripps it out

- Send a warning when a Device previosly replying to artPoll doesnt reply anymore

What happens when a node suddenly changes its Ip address? how can we show it as the same node, and how do we inform the user?

- identify devices also by MacAddress, report to the user that the ip has changed of one node. first thoru a notification, then throu a symbol next to the device name in the device tap.

What when two persons simultaniosly patch a device? 

- check for artAddress commands while the user is typing new names for a device or trys to route dmx universes. When the value changes while editing display a warning
- after the user hits enter, display a loading circle in the field and only show a ok sign when the next artPollReply confirms the change, else send a warning after timeout.
- Inforamtion when artDMX packets come without sequence or out of order.

Jitter Graphs per universe where they show jitter between to artDMX packets from that universe, so artDMX sequence=1 and artDMX sequence=2 are messured in that graph.

Jittergraphs per Node ArtPollReply timings

## Event Reporting

A message center for important events is missing

- the message center should show messages for
  - Devices
    - new device discovered
    - device disconnected
    - ip address changed
    - long name changed
    - port name changed
    - patch changed
    - status changed

## UI / UX

- in the top bar the search function is a nice idea, but doesnt do anything. make plans for it.

## Warnings

- TopBar: Think about the criteria for Warning and ok



### Other Tabs

- An Timecode monitor is missing, where could it be Put? maybe we can provide play button and settings so we can send timecode to artnet network?
  - maby in the dashboard instead of the big universe chart. 
  - 
- In the inspector tab, artSync lable is displayed colored when artSync packets are present in the network for this universe. Add a ArtSync source to the lable. so the user knows who gives the Rythm. make shure the active lable only lights up when the artsync packets are for the corresponding universe.
- In the footer bar / at the bottom of the screen (how is this called?), there should also be a artSync lable, with a little dot pulsing everytime an artSync packet comes in.
  - This should have a tooltip stating the corresponding universes, sum universes next to each other (i.e. Uni 1,3,5-10,12,14,30-100 ) of the ArtSync packets
  - When multiple artSync pakets ar received and this is not to ArtNet4 spec, the dot gets red
  - The indicator shows the ArtSync status of all ArtSync senders combined
- In the footer bar / at the bottom of the screen (how is this called?), there should be a Timecode monitor, when timecode comes in it runs and a dot is pulsing, if not it shows zerrors and the dot is pale.
  - This should have a tooltip with the src ips, diffrent timecode streams, error message error is if presend
  - when multiple timecode streams are present, the timecode stream can be switched by a double click on the timecode indicator. 
  - When there is an error in the timecode packets, the dot gets red.
- In the Settings, there should be a switch between "Send dignostic" unicast and Broadcast. for the ArtPoll packets from lumenflow
- In the Devces tab, the read current button needs to show some reactivity, a loading symbol that resolves when the next artPollReply from that node came in and all the date has been updated.

### Devices tab

- in the Devices tap, the listed devices load to long, this is irritatian on the user. 

- In the Protocol, core layer, the NodeReport of an ArtPollReply Packet doesnt get rendered properly. 
  - for every new art pollReply from an node the text should update in the Devices tab, so in the "Node Report#0001 [0120] Power on tests successful" the counter goes up.
- A button for OpTimeSync 0x9800 would be nice so we can sync the time with the click of a button.
  - mayby one button for that in the devices tap
  - mayby one button integratted in the system clock in the top bar of lumenflow



### Settings

- Make it a modal
- Let LongName be Editable
- Make better NIC Options
- Make Jitter and Warning limits variable
- 

