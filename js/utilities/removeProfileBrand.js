export default function removeProfileBrand() {
    if (document.querySelector('.profile_ban_status') && document.querySelector('#responsive_page_template_content > div.no_header.profile_page.has_profile_background > div.profile_header_bg > div > div > div > div.profile_header_badgeinfo > div.profile_header_actions > a').href.endsWith('/edit/info'))document.querySelector('.profile_ban_status').remove();

    }    