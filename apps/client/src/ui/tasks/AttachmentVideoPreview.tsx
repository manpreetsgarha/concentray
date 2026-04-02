import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { FONT_SANS } from "../theme";

interface AttachmentVideoPreviewProps {
  uri: string;
  mimeType?: string;
}

export function AttachmentVideoPreview({ uri, mimeType }: AttachmentVideoPreviewProps) {
  if (Platform.OS !== "web") {
    return <Text style={styles.attachmentMeta}>Video preview is available on web. Use Open Attachment.</Text>;
  }

  return (
    <View style={styles.videoFrame}>
      {React.createElement(
        "video",
        {
          controls: true,
          preload: "metadata",
          style: {
            width: "100%",
            height: "100%",
            borderRadius: 18,
            backgroundColor: "#081018"
          }
        },
        React.createElement("source", {
          src: uri,
          type: mimeType || "video/mp4"
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  attachmentMeta: {
    color: "#526080",
    fontSize: 12,
    fontFamily: FONT_SANS
  },
  videoFrame: {
    width: "100%",
    height: 240,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#060810"
  }
});
