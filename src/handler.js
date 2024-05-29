import { ChimeSDKMessaging } from "@aws-sdk/client-chime-sdk-messaging";
import { ChimeSDKIdentity } from "@aws-sdk/client-chime-sdk-identity";
import { v4 as uuidv4 } from "uuid";
const chimeMessagingClient = new ChimeSDKMessaging();
const chimeSdkClient = new ChimeSDKIdentity();

//Creates an appInstance
const createAppInstance = async (appInstanceName) => {
    return chimeSdkClient.createAppInstance({
        Name: appInstanceName,
    });
};

//Creates an appInstanceUser
const createAppInstanceUser = async (
    appInstanceArn,
    appInstanceUserId,
    name
) => {
    return chimeSdkClient.createAppInstanceUser({
        AppInstanceArn: appInstanceArn,
        AppInstanceUserId: appInstanceUserId,
        Name: name,
    });
};

//Create an channel
const createChannel = async (
    appInstanceArn,
    metadata,
    name,
    chimeBearer,
    memberArns
) => {
    return chimeMessagingClient.createChannel({
        AppInstanceArn: appInstanceArn,
        ClientRequestToken: uuidv4(),
        Metadata: metadata,
        Mode: "RESTRICTED",
        Name: name,
        Privacy: "PRIVATE",
        ChimeBearer: chimeBearer,
        MemberArns: memberArns,
    });
};

//Send a message to the channel
const sendMessage = async (channelArn, content, chimeBearer, metadata) => {
    return chimeMessagingClient.sendChannelMessage({
        ChannelArn: channelArn,
        Content: content,
        ChimeBearer: chimeBearer,
        Type: "STANDARD",
        ClientRequestToken: uuidv4(),
        Persistence: "PERSISTENT",
        Metadata: metadata,
    });
};

async () => {
    const appInstanceArn = (await createAppInstance()).AppInstanceArn;

    console.log(`AppInstance Created => ${appInstanceArn}`);

    //AppInstanceUserArn will be in the format of {appInstanceArn}/user/{appInstanceUserId}
    const userArn1 = await createAppInstanceUser(
        appInstanceArn,
        "User-1",
        "Jane"
    );
    console.log(`userArn1 Created => ${userArn1.AppInstanceUserArn}`);

    const userArn2 = await createAppInstanceUser(
        appInstanceArn,
        "User-2",
        "Clara"
    );
    console.log(`userArn2 Created => ${userArn2.AppInstanceUserArn}`);
    
    
    const channel = await createChannel(
        appInstanceArn,
        null,
        "Channel 1",
        userArn1, //Here we can user any of the two user arns, But whoever is creating the channel will automatically become a moderator to the channel
        [userArn1.AppInstanceUserArn, userArn2.AppInstanceUserArn]
    );

    //we can use metadata to include some extra information to the message like attachments
    await sendMessage(channel.ChannelArn, "Message from Jane", userArn1, null);
    await sendMessage(channel.ChannelArn, "Message from Clara", userArn2, null);
};
