import type UniboxOverview from "@/lib/api/models/app/unibox/UniboxOverview";
import Request from "../../Request";

export default async function getOverview(creatorOnly?: boolean): Promise<UniboxOverview> {
    return await Request<UniboxOverview>({
        method: "GET",
        url: creatorOnly ? "/unibox/overview?creator_only=true" : "/unibox/overview",
        authorization: true,
    })
}
