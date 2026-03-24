# IP Programming with artIpProg (0xf800)

when in the UI in the devices tab i try to change the ip of a node, the send packet looks wrong.
Should output a packet with "Programm IP" Flag set true and the new IP address. Because it should programm only the IP Address of the node

### Problem:

Does sent a packet with "Program Subnet Mask" set True. this is wrong i think?

### Send packet by lumenflow:

Art-Net, Opcode: ArtIpProg (0xf800)
    Descriptor Header
        ID: Art-Net
        OpCode: ArtIpProg (0xf800)
        ProtVer: 14
    ArtIpProg packet
        filler: 0000
        Command: 0x8a, Program Subnet Mask, Reset Parameters, Enable Programming
            .... ...0 = Program Port: False
            .... ..1. = Program Subnet Mask: True
            .... .0.. = Program IP: False
            .... 1... = Reset Parameters: True
            ...0 .... = Program Default Gateway: False
            ..0. .... = Unused: 0x0
            .0.. .... = Enable DHCP: False
            1... .... = Enable Programming: True
        filler: 00
        IP Address: 192.168.1.111
        Subnet Mask: 0.0.0.0
        Port: 6454
        Default Gateway: 0.0.0.0
        spare: 00000000
    Excess Bytes: 0000

# Subnetmask Programming with artIpProg (0xf800)

when in the UI in the devices tab i try to change the subnetmask of a node, the send packet looks wrong.  
Should output a packet with "Program Subnet Mask" Flag set true and the new Subnetmask. Because it should programm only the Subnet Mask of the node

### Problem:

Does sent a packet with "Program IP" set True. this is wrong i think?

### Send packet by lumenflow:

Art-Net, Opcode: ArtIpProg (0xf800)
    Descriptor Header
        ID: Art-Net
        OpCode: ArtIpProg (0xf800)
        ProtVer: 14
    ArtIpProg packet
        filler: 0000
        Command: 0x86, Program Subnet Mask, Program IP, Enable Programming
            .... ...0 = Program Port: False
            .... ..1. = Program Subnet Mask: True
            .... .1.. = Program IP: True
            .... 0... = Reset Parameters: False
            ...0 .... = Program Default Gateway: False
            ..0. .... = Unused: 0x0
            .0.. .... = Enable DHCP: False
            1... .... = Enable Programming: True
        filler: 00
        IP Address: 0.0.0.0
        Subnet Mask: 255.0.0.0
        Port: 6454
        Default Gateway: 0.0.0.0
        spare: 00000000
    Excess Bytes: 0000

# Gateway Programming with artIpProg (0xf800)

when in the UI in the devices tab i try to change the gateway of a node, the send packet looks wrong.  
Should output a packet with "Program Default Gateway" Flag set true and the new Gateway. Because it should programm only the Default Gateway of the node

### Problem:

Does sent a packet with "Program Subnet Mask" set True. this is wrong i think?

### Send packet by lumenflow:

Art-Net, Opcode: ArtIpProg (0xf800)
    Descriptor Header
        ID: Art-Net
        OpCode: ArtIpProg (0xf800)
        ProtVer: 14
    ArtIpProg packet
        filler: 0000
        Command: 0xa2, Program Subnet Mask, Enable Programming
            .... ...0 = Program Port: False
            .... ..1. = Program Subnet Mask: True
            .... .0.. = Program IP: False
            .... 0... = Reset Parameters: False
            ...0 .... = Program Default Gateway: False
            ..1. .... = Unused: 0x1
            .0.. .... = Enable DHCP: False
            1... .... = Enable Programming: True
        filler: 00
        IP Address: 0.0.0.0
        Subnet Mask: 0.0.0.0
        Port: 6454
        Default Gateway: 192.168.1.1
        spare: 00000000
    Excess Bytes: 0000

# Port Programming with artIpProg (0xf800)

when in the UI in the devices tab i try to change the port of a node, the send packet looks wrong.  
Should output a packet with "Program Port" Flag set true and the new Port. Because it should programm only the Port of the node

### Problem:

Does sent a packet with "Program Subnet Mask" set True. this is wrong i think?

### Send packet by lumenflow:

Art-Net, Opcode: ArtIpProg (0xf800)
    Descriptor Header
        ID: Art-Net
        OpCode: ArtIpProg (0xf800)
        ProtVer: 14
    ArtIpProg packet
        filler: 0000
        Command: 0xa2, Program Subnet Mask, Enable Programming
            .... ...0 = Program Port: False
            .... ..1. = Program Subnet Mask: True
            .... .0.. = Program IP: False
            .... 0... = Reset Parameters: False
            ...0 .... = Program Default Gateway: False
            ..1. .... = Unused: 0x1
            .0.. .... = Enable DHCP: False
            1... .... = Enable Programming: True
        filler: 00
        IP Address: 0.0.0.0
        Subnet Mask: 0.0.0.0
        Port: 6454
        Default Gateway: 192.168.1.1
        spare: 00000000
    Excess Bytes: 0000